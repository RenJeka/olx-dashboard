// Хелпери для тестів, що працюють з БД (тимчасовий файл libSQL — див. vitest.config.ts).
import { db, dbAll, dbGet, initDb } from '../db/db.js';
import type { RawListing } from '../types.js';

// Порядок — від залежних до батьківських (FK).
const TABLES = ['price_history', 'scan_runs', 'app_logs', 'listings', 'searches', 'projects'];

/** Застосувати схему (один раз на файл) і очистити всі таблиці. */
export async function resetDb(): Promise<void> {
  await initDb();
  await db.batch(
    TABLES.map((t) => `DELETE FROM ${t}`),
    'write',
  );
}

/** Створити пошук і повернути його id. */
export async function createSearch(localFilters: object = {}): Promise<number> {
  const res = await db.execute({
    sql: 'INSERT INTO searches (name, query, local_filters) VALUES (?, ?, ?)',
    args: ['test', 'iphone 13', JSON.stringify(localFilters)],
  });
  return Number(res.lastInsertRowid);
}

export interface ListingRow {
  id: number;
  olx_id: number;
  status: string;
  status_source: string;
  miss_count: number;
  note: string | null;
  olx_status: string | null;
  filtered_out: number;
  price: number | null;
  city: string | null;
  title: string | null;
  description: string | null;
  last_refresh_at: string | null;
  analysis_stale: number;
}

export const getListing = (olxId: number) =>
  dbGet<ListingRow>('SELECT * FROM listings WHERE olx_id = ?', [olxId]);

export const allListings = () => dbAll<ListingRow>('SELECT * FROM listings ORDER BY olx_id');

/** Вставити рядок оголошення напряму (стан «до скану»). */
export async function insertListing(
  searchId: number,
  olxId: number,
  fields: Partial<Omit<ListingRow, 'id' | 'olx_id'>> = {},
): Promise<void> {
  const row = { status: 'new', status_source: 'auto', miss_count: 0, note: '', ...fields };
  const cols = ['olx_id', 'search_id', 'title', ...Object.keys(row)];
  const vals = [olxId, searchId, `item ${olxId}`, ...Object.values(row)];
  await db.execute({
    sql: `INSERT INTO listings (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    args: vals as (string | number | null)[],
  });
}

/** Сирий GraphQL-рядок (структуровані поля присутні — createdAt задано). */
export function gqlListing(olxId: number, overrides: Partial<RawListing> = {}): RawListing {
  return {
    olxId,
    title: `item ${olxId}`,
    rawPrice: '',
    url: `https://www.olx.ua/d/uk/obyavlenie/item-${olxId}.html`,
    price: 10000,
    currency: 'UAH',
    createdAt: '2026-09-01T10:00:00+03:00',
    lastRefreshAt: '2026-09-20T10:00:00+03:00',
    city: 'Київ',
    olxStatus: 'active',
    ...overrides,
  };
}
