import '../env.js'; // ПЕРШИМ: гарантує .env у process.env до читання TURSO_* нижче.
import { createClient, type InArgs, type InStatement, type ResultSet } from '@libsql/client';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// db.ts лежить у server/src/db → піднятись на 2 рівні до server/ (data/, schema.sql).
const SCHEMA_PATH = join(__dirname, 'schema.sql');
const DEFAULT_LOCAL_DB = join(__dirname, '..', '..', 'data', 'olx.db');

/**
 * Єдиний клієнт libSQL для локалки і прода:
 * - локально (за замовчуванням) — `file:` відкриває наявний server/data/olx.db (той самий async API);
 * - у проді — TURSO_DATABASE_URL (`libsql://…`) + TURSO_AUTH_TOKEN (для `file:` токен не потрібен).
 * libSQL — SQLite-сумісний, тож схема/SQL/бізнес-логіка не змінюються.
 */
// Порожній рядок у .env (`TURSO_DATABASE_URL=`) — це «не задано», не валідний URL.
// `??` спіймав би лише undefined, тож нормалізуємо порожні/пробільні значення до undefined.
const envOrUndefined = (v: string | undefined): string | undefined => {
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
};

const dbUrl = envOrUndefined(process.env.TURSO_DATABASE_URL) ?? `file:${DEFAULT_LOCAL_DB}`;

// libSQL не створює батьківський каталог для `file:` — гарантуємо його для локальної БД,
// інакше перший запуск на чистому клоні падає з SQLITE_CANTOPEN (код 14).
if (dbUrl.startsWith('file:')) {
  mkdirSync(dirname(dbUrl.slice('file:'.length)), { recursive: true });
}

export const db = createClient({
  url: dbUrl,
  authToken: envOrUndefined(process.env.TURSO_AUTH_TOKEN),
});

// ── Тонкі async-обгортки навколо db.execute ──────────────────────────────────
// НЕ ORM/query-builder: лише прибирають boilerplate `{ sql, args }` і локалізують каст
// libSQL Row → доменний тип у єдиному місці (шар БД). Інтерактивні транзакції/batch
// використовують сирий клієнт напряму (db.transaction / db.batch).

/** SELECT → перший рядок або undefined (як better-sqlite3 .get). */
export async function dbGet<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const { rows } = await db.execute({ sql, args });
  return rows[0] as unknown as T | undefined;
}

/** SELECT → усі рядки (як better-sqlite3 .all). */
export async function dbAll<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const { rows } = await db.execute({ sql, args });
  return rows as unknown as T[];
}

/** INSERT/UPDATE/DELETE → ResultSet (lastInsertRowid: bigint, rowsAffected: number). */
export async function dbRun(sql: string, args: InArgs = []): Promise<ResultSet> {
  return db.execute({ sql, args });
}

/**
 * Максимум statements на один db.batch. Тисячі UPSERT/UPDATE одним batch-ем — мережевий payload у
 * мегабайти: Turso рве з'єднання (`fetch failed`; S16 — збереження фільтра на великому пошуку,
 * docs/plans/scan-failure-recovery.md — великий deep-скан). Чанки жертвують атомарністю всього
 * набору (кожен чанк — окрема транзакція): частково записане краще за втрачене цілком.
 */
export const BATCH_CHUNK = 500;

/** Записати statements batch-ами по ≤BATCH_CHUNK (типовий набір — один round-trip). */
export async function dbBatchChunked(statements: InStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += BATCH_CHUNK) {
    await db.batch(statements.slice(i, i + BATCH_CHUNK), 'write');
  }
}

// ── Автоміграція колонок (docs/plans/db-auto-migrate.md) ─────────────────────

/** Розбити тіло CREATE TABLE на визначення верхнього рівня (коми поза дужками й лапками). */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Визначення колонки з CREATE TABLE (з REFERENCES/CHECK/DEFAULT), без `--`-коментарів. */
function columnDefinition(createSql: string, column: string): string | undefined {
  const withoutComments = createSql.replace(/--[^\n]*/g, '');
  const body = withoutComments.slice(withoutComments.indexOf('(') + 1, withoutComments.lastIndexOf(')'));
  return splitTopLevel(body).find((def) => def.split(/\s+/)[0]?.replace(/["`[\]]/g, '') === column);
}

/** Чому SQLite не зможе виконати ADD COLUMN з таким визначенням (або undefined, якщо зможе). */
function addColumnBlocker(definition: string): string | undefined {
  const upper = definition.toUpperCase();
  if (/\bPRIMARY\s+KEY\b/.test(upper)) return 'PRIMARY KEY';
  if (/\bUNIQUE\b/.test(upper)) return 'UNIQUE';
  if (/\bDEFAULT\s*\(/.test(upper)) return 'неконстантний DEFAULT (вираз)';
  if (/\bNOT\s+NULL\b/.test(upper) && !/\bDEFAULT\b/.test(upper)) return 'NOT NULL без DEFAULT';
  return undefined;
}

/**
 * Для таблиць, що вже є в робочій БД, знайти колонки зі schema.sql, яких у них немає, і
 * повернути відповідні `ALTER TABLE … ADD COLUMN`. Еталон — схема, застосована до БД у пам'яті.
 * Колонки, яких немає в схемі, не видаляються. Кидає помилку, якщо хоч одну колонку не можна
 * додати через ADD COLUMN (до будь-яких змін у робочій БД).
 */
async function planColumnMigrations(schema: string): Promise<string[]> {
  const reference = createClient({ url: ':memory:' });
  try {
    await reference.executeMultiple(schema);
    const { rows: tables } = await reference.execute(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    const statements: string[] = [];
    const blocked: string[] = [];
    for (const { name, sql } of tables as unknown as { name: string; sql: string }[]) {
      const { rows: existing } = await db.execute(`PRAGMA table_info(${name})`);
      if (existing.length === 0) continue; // таблиці ще немає — її створить schema.sql
      const have = new Set(existing.map((r) => String(r.name)));
      const { rows: wanted } = await reference.execute(`PRAGMA table_info(${name})`);
      for (const col of wanted.map((r) => String(r.name)).filter((c) => !have.has(c))) {
        const definition = columnDefinition(sql, col);
        const blocker = definition ? addColumnBlocker(definition) : 'визначення не знайдено';
        if (blocker) blocked.push(`${name}.${col} (${blocker})`);
        else statements.push(`ALTER TABLE ${name} ADD COLUMN ${definition}`);
      }
    }
    if (blocked.length > 0) {
      throw new Error(
        `Автоміграція схеми неможлива для: ${blocked.join(', ')}. ` +
          'Потрібна ручна міграція (rebuild таблиці) — див. docs/development.md §4.',
      );
    }
    return statements;
  } finally {
    reference.close();
  }
}

/**
 * Застосовує канонічну схему (server/src/db/schema.sql) і додає в наявні таблиці колонки,
 * яких бракує (ідемпотентно). Викликати на старті КОЖНОЇ точки входу (index.ts, scan.ts,
 * migratePostedAt.ts) ДО першого доступу до БД. Повертає застосовані `ALTER TABLE` —
 * логує викликач (logger.ts імпортує db.ts, тож тут логера немає).
 */
export async function initDb(): Promise<string[]> {
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');

  // Колонки — ДО schema.sql: її CREATE INDEX можуть посилатися на нові колонки.
  const migrations = await planColumnMigrations(schema);
  if (migrations.length > 0) await db.batch(migrations, 'write');

  await db.executeMultiple(schema);

  // Міграція: прибрати індекс по last_seen_at на вже задеплоєних БД. Цей індекс
  // перезаписувався на кожному upsert (last_seen_at = now), множачи Turso "rows written";
  // verify-прохід P1 обходиться без нього (docs/plans/old/turso-write-optimization.md).
  await db.execute('DROP INDEX IF EXISTS idx_listings_search_lastseen');
  return migrations;
}
