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
addColumnIfMissing('searches', 'sort_order', 'INTEGER');
addColumnIfMissing('scan_runs', 'requests_done', 'INTEGER DEFAULT 0');
addColumnIfMissing('scan_runs', 'requests_total', 'INTEGER');
addColumnIfMissing('scan_runs', 'fetch_method', 'TEXT');
addColumnIfMissing('scan_runs', 'kind', "TEXT DEFAULT 'normal'");
// Попередження часткового успіху окремо від реальної помилки (щоб UI не показував warning як «Помилку»).
addColumnIfMissing('scan_runs', 'warning', 'TEXT');

// Деталізований прогрес сканування (docs/plans/scan-progress-detail.md).
addColumnIfMissing('scan_runs', 'stage', 'TEXT');
addColumnIfMissing('scan_runs', 'sub_done', 'INTEGER');
addColumnIfMissing('scan_runs', 'sub_total', 'INTEGER');
addColumnIfMissing('listings', 'pros', "TEXT DEFAULT ''");
addColumnIfMissing('listings', 'cons', "TEXT DEFAULT ''");

// LLM-аналіз — критерії на рівні пошуку (searches не зачіпає rebuild нижче).
addColumnIfMissing('searches', 'analysis_criteria', "TEXT DEFAULT '{}'");

// Семантичний фільтр релевантності — цільовий товар на рівні пошуку.
addColumnIfMissing('searches', 'relevance_target', "TEXT DEFAULT ''");

// Синоніми пошукового запиту (docs/plans/search-synonyms.md) — JSON-масив рядків.
addColumnIfMissing('searches', 'query_synonyms', "TEXT DEFAULT '[]'");

// Архів пошуків (docs/plans/archive-searches.md) — прапорець прихованих зі списку.
addColumnIfMissing('searches', 'archived', 'INTEGER DEFAULT 0');

/**
 * Етап 2: `listings` table rebuild — новий CHECK на status (+ 'rejected') і колонка
 * miss_count. ALTER TABLE не міняє CHECK-констрейнти, тому потрібен повний rebuild
 * у транзакції. Гейтиться через PRAGMA user_version (ідемпотентно).
 */
const LISTINGS_SCHEMA_VERSION = 2;

const LISTINGS_COMMON_COLUMNS = `
  id, olx_id, search_id, title, url, price, currency, city, district, params,
  photo_url, seller_type, description, seller_name, contact_name, olx_status,
  posted_at, status, status_source, note, pros, cons, filtered_out, first_seen_at, last_seen_at
`;

function migrateListingsTable(): void {
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  if (userVersion >= LISTINGS_SCHEMA_VERSION) return;

  // PRAGMA foreign_keys не можна змінювати всередині транзакції (потрібно для
  // безпечного DROP TABLE listings, на яку посилається price_history.listing_id).
  db.pragma('foreign_keys = OFF');

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE listings_new (
        id INTEGER PRIMARY KEY,
        olx_id INTEGER NOT NULL UNIQUE,
        search_id INTEGER REFERENCES searches(id),
        title TEXT,
        url TEXT,
        price REAL,
        currency TEXT DEFAULT 'UAH',
        city TEXT,
        district TEXT,
        params TEXT DEFAULT '{}',
        photo_url TEXT,
        seller_type TEXT,
        description TEXT,
        seller_name TEXT,
        contact_name TEXT,
        olx_status TEXT,
        posted_at TEXT,
        status TEXT DEFAULT 'new'
          CHECK (status IN ('new','interested','contacted','rejected','disabled')),
        status_source TEXT DEFAULT 'auto',
        note TEXT DEFAULT '',
        pros TEXT DEFAULT '',
        cons TEXT DEFAULT '',
        filtered_out INTEGER DEFAULT 0,
        miss_count INTEGER DEFAULT 0,
        first_seen_at TEXT DEFAULT (datetime('now')),
        last_seen_at TEXT
      )
    `);

    db.exec(`
      INSERT INTO listings_new (${LISTINGS_COMMON_COLUMNS})
      SELECT ${LISTINGS_COMMON_COLUMNS} FROM listings
    `);

    db.exec('DROP TABLE listings');
    db.exec('ALTER TABLE listings_new RENAME TO listings');
    db.exec('CREATE INDEX IF NOT EXISTS idx_listings_search_status ON listings(search_id, status)');
  });

  migrate();
  db.pragma('foreign_keys = ON');
  db.pragma(`user_version = ${LISTINGS_SCHEMA_VERSION}`);
}

migrateListingsTable();

// Після rebuild-міграції (інакше listings_new без цієї колонки втратив би її на v1-БД).
addColumnIfMissing('listings', 'last_refresh_at', 'TEXT');

// LLM-аналіз на рівні оголошення — теж ПІСЛЯ rebuild (LISTINGS_COMMON_COLUMNS їх не
// переносить, тож на старій v1-БД rebuild затер би їх → крах normalizer на старті).
addColumnIfMissing('listings', 'analysis_at', 'TEXT');
addColumnIfMissing('listings', 'analysis_source', 'TEXT');
addColumnIfMissing('listings', 'analysis_model', 'TEXT');
addColumnIfMissing('listings', 'analysis_stale', 'INTEGER DEFAULT 0');

// AI Вибір позицій — ранжування через OpenRouter (план docs/plans/AI-auto-top.md).
addColumnIfMissing('listings', 'ai_rank', 'INTEGER');
addColumnIfMissing('listings', 'ai_pick_reason', 'TEXT');
addColumnIfMissing('listings', 'ai_ranked_at', 'TEXT');

// Семантичний фільтр релевантності (план docs/plans/semantic-relevance-filter.md).
addColumnIfMissing('listings', 'ai_relevant', 'INTEGER');
addColumnIfMissing('listings', 'ai_relevant_reason', 'TEXT');
addColumnIfMissing('listings', 'ai_relevant_at', 'TEXT');
addColumnIfMissing('listings', 'ai_relevant_source', 'TEXT');

// Галерея фото (docs/plans/photo-gallery.md) — JSON-масив прев'ю-лінків усіх фото.
addColumnIfMissing('listings', 'photo_urls', 'TEXT');

/**
 * Одноразовий бекфіл sort_order для існуючих пошуків (нові колонки — NULL).
 * Зберігає поточний видимий порядок (найновіші згори) як 0..N-1.
 */
function backfillSortOrder(): void {
  const pending = db
    .prepare('SELECT id FROM searches WHERE sort_order IS NULL ORDER BY created_at DESC, id DESC')
    .all() as { id: number }[];
  if (pending.length === 0) return;

  const update = db.prepare('UPDATE searches SET sort_order = ? WHERE id = ?');
  const run = db.transaction((rows: { id: number }[]) => {
    rows.forEach((row, index) => update.run(index, row.id));
  });
  run(pending);
}

backfillSortOrder();
