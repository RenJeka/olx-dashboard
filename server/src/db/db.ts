import '../env.js'; // ПЕРШИМ: гарантує .env у process.env до читання TURSO_* нижче.
import { createClient, type InArgs, type ResultSet } from '@libsql/client';
import { readFileSync } from 'node:fs';
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
export const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? `file:${DEFAULT_LOCAL_DB}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
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
 * Застосовує канонічну схему (server/src/db/schema.sql, CREATE TABLE IF NOT EXISTS).
 * Викликати на старті КОЖНОЇ точки входу (index.ts, scan.ts, migratePostedAt.ts) ДО
 * першого доступу до БД — на порожній Turso/новій локальній БД це створює всі таблиці.
 */
export async function initDb(): Promise<void> {
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  await db.executeMultiple(schema);

  // Міграція: прибрати індекс по last_seen_at на вже задеплоєних БД. Цей індекс
  // перезаписувався на кожному upsert (last_seen_at = now), множачи Turso "rows written";
  // verify-прохід P1 обходиться без нього (docs/plans/turso-write-optimization.md).
  await db.execute('DROP INDEX IF EXISTS idx_listings_search_lastseen');
}
