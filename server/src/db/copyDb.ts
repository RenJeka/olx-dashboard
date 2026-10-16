// Копія однієї libSQL-БД в іншу (прод Turso → локальний файл, docs/plans/old/db-copy-prod.md).
// Джерело — лише SELECT: схема з sqlite_master, дані keyset-пагінацією за rowid (кожен рядок
// читається один раз — Turso рахує прочитані рядки, OFFSET перечитував би попередні сторінки).
import type { Client, InStatement, ResultSet, Value } from '@libsql/client';

/** Рядків на сторінку: опис оголошення до кількох КБ → сторінка ~1 МБ, без розриву з'єднання. */
export const COPY_PAGE_SIZE = 200;

// Службові таблиці SQLite/libSQL/реплікації — створюються рушієм самі, не копіюються.
const SERVICE_PREFIXES = ['sqlite_', 'libsql_', '_litestream'];

interface SchemaObject {
  type: string;
  name: string;
  sql: string;
}

export interface CopiedTable {
  table: string;
  rows: number;
}

const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;

async function readSchema(source: Client): Promise<SchemaObject[]> {
  // ORDER BY rowid — порядок створення: батьківські таблиці раніше за залежні (FK).
  const { rows } = await source.execute(
    'SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY rowid',
  );
  return rows
    .map((r) => ({ type: String(r.type), name: String(r.name), sql: String(r.sql) }))
    .filter((o) => !SERVICE_PREFIXES.some((p) => o.name.startsWith(p)));
}

async function copyTableRows(
  source: Client,
  target: Client,
  table: string,
  onPage: (rows: number) => void,
): Promise<number> {
  let lastRowid: bigint | number = -1;
  let copied = 0;
  for (;;) {
    const page: ResultSet = await source.execute({
      sql: `SELECT rowid AS __copy_rowid, * FROM ${quoteIdent(table)} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
      args: [lastRowid, COPY_PAGE_SIZE],
    });
    if (page.rows.length === 0) return copied;

    const columns = page.columns.slice(1);
    const insertSql =
      `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) ` +
      `VALUES (${columns.map(() => '?').join(', ')})`;
    const statements: InStatement[] = page.rows.map((row) => ({
      sql: insertSql,
      args: columns.map((_, i) => row[i + 1] ?? null),
    }));
    await target.batch(statements, 'write');

    copied += page.rows.length;
    onPage(copied);
    const tail: Value | undefined = page.rows.at(-1)?.[0];
    if (typeof tail !== 'bigint' && typeof tail !== 'number') {
      throw new Error(`Таблиця ${table}: rowid не число (${String(tail)})`);
    }
    lastRowid = tail;
    if (page.rows.length < COPY_PAGE_SIZE) return copied;
  }
}

/**
 * Скопіювати схему й усі дані `source` у порожню `target`: таблиці → рядки → індекси/тригери/view
 * (індекси наприкінці — вставка без їх підтримки швидша). Повертає кількість рядків по таблицях.
 */
export async function copyDatabase(
  source: Client,
  target: Client,
  onProgress: (table: string, rows: number) => void = () => {},
): Promise<CopiedTable[]> {
  const schema = await readSchema(source);
  const virtual = schema.find((o) => /^CREATE\s+VIRTUAL\s/i.test(o.sql));
  if (virtual) throw new Error(`Віртуальні таблиці не підтримуються: ${virtual.name}`);

  const tables = schema.filter((o) => o.type === 'table');
  await target.execute('PRAGMA foreign_keys = OFF');
  await target.batch(
    tables.map((t) => t.sql),
    'write',
  );

  const result: CopiedTable[] = [];
  for (const t of tables) {
    const rows = await copyTableRows(source, target, t.name, (n) => onProgress(t.name, n));
    result.push({ table: t.name, rows });
  }

  const rest = schema.filter((o) => o.type !== 'table');
  if (rest.length > 0) {
    await target.batch(
      rest.map((o) => o.sql),
      'write',
    );
  }
  return result;
}
