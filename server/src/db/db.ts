import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// server/data/olx.db (db.ts лежить у server/src/db → піднятись на 2 рівні до server/)
const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DATA_DIR, 'olx.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Застосовуємо канонічну схему при старті (CREATE TABLE IF NOT EXISTS).
const schema = readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

interface ColumnInfo {
  name: string;
}

/**
 * Ідемпотентно додає колонку до існуючої таблиці, якщо вона відсутня.
 * CREATE TABLE IF NOT EXISTS не додає колонки до вже існуючих таблиць —
 * для існуючої БД користувача (server/data/olx.db) потрібен явний ALTER TABLE.
 */
function addColumnIfMissing(table: string, column: string, ddlType: string): void {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  const hasColumn = existing.some((col) => col.name === column);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType}`);
  }
}

addColumnIfMissing('listings', 'description', 'TEXT');
addColumnIfMissing('listings', 'seller_name', 'TEXT');
addColumnIfMissing('listings', 'contact_name', 'TEXT');
addColumnIfMissing('listings', 'olx_status', 'TEXT');
addColumnIfMissing('searches', 'visible_total_count', 'INTEGER');
addColumnIfMissing('scan_runs', 'requests_done', 'INTEGER DEFAULT 0');
addColumnIfMissing('scan_runs', 'requests_total', 'INTEGER');
