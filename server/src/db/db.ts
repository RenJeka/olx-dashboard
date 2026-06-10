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
