import type { InValue } from '@libsql/client';
import { dbAll, dbGet, dbRun } from '../db.js';
import type { ListingPatch } from '../../types.js';

// Білий список колонок для сортування (захист від SQL-інʼєкцій).
export const LISTING_SORTABLE = new Set(['price', 'title', 'city', 'posted_at', 'first_seen_at', 'last_seen_at']);

// Легкий рядок таблиці (docs/plans/old/listings-light-payload.md): без повного опису й галереї — вони
// найважчі у відповіді великого пошуку (пам'ять API, S14). Опис — лише початок (`description_head`),
// з якого сервіс робить фрагмент для колонки; повний опис і `photo_urls` — `/details` на вимогу.
const DESCRIPTION_HEAD_CHARS = 600;

const LISTING_COLUMNS = `id, olx_id, search_id, title, url, price, currency, city, district,
                category_id, category_type,
                photo_url, substr(description, 1, ${DESCRIPTION_HEAD_CHARS}) AS description_head,
                seller_name, contact_name, olx_status,
                status, status_source, note, pros, cons, filtered_out, miss_count,
                analysis_at, analysis_source, analysis_model, analysis_stale,
                ai_rank, ai_pick_reason, ai_ranked_at,
                ai_relevant, ai_relevant_reason, ai_relevant_at, ai_relevant_source,
                posted_at, first_seen_at, last_seen_at`;

/** Легкий рядок: колонки таблиці + `description_head` (початок опису). */
export type LightRowRaw = Record<string, unknown> & { description_head: string | null };

/** Легкі рядки пошуку; `sort` — з LISTING_SORTABLE. */
export function listLightRows(searchId: number, sort: string, order: 'ASC' | 'DESC'): Promise<LightRowRaw[]> {
  return dbAll<LightRowRaw>(
    `SELECT ${LISTING_COLUMNS}
       FROM listings
       WHERE search_id = ?
       ORDER BY ${sort} ${order}`,
    [searchId],
  );
}

export function getLightRow(id: number): Promise<LightRowRaw | undefined> {
  return dbGet<LightRowRaw>(`SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ?`, [id]);
}

export async function listingExists(id: number): Promise<boolean> {
  return (await dbGet('SELECT id FROM listings WHERE id = ?', [id])) !== undefined;
}

/** Повний опис і галерея одного оголошення. */
export function getListingDetails(id: number): Promise<Record<string, unknown> | undefined> {
  return dbGet('SELECT id, description, photo_urls FROM listings WHERE id = ?', [id]);
}

/** Те саме пакетом — лише рядки цього пошуку. */
export function listListingDetails(searchId: number, ids: number[]): Promise<Record<string, unknown>[]> {
  return dbAll(
    `SELECT id, description, photo_urls FROM listings
       WHERE search_id = ? AND id IN (${ids.map(() => '?').join(', ')})`,
    [searchId, ...ids],
  );
}

/** Порція назв і описів пошуку за id > afterId (пошук в описі — без тримання всіх описів у пам'яті). */
export function listTextChunk(
  searchId: number,
  afterId: number,
  limit: number,
): Promise<{ id: number; title: string | null; description: string | null }[]> {
  return dbAll(
    `SELECT id, title, description FROM listings
       WHERE search_id = ? AND id > ? ORDER BY id LIMIT ${limit}`,
    [searchId, afterId],
  );
}

/**
 * Ручна зміна з UI (значення вже перевірені сервісом). Будь-яка зміна статусу → status_source='manual',
 * miss_count=0; ai_relevant → source='manual' (авто-прогін не перетре); olx_status — разова підказка БЕЗ
 * source-захисту (скан/verify перепише, коли побачить оголошення). Порожній patch — без запиту.
 */
export async function applyManualPatch(id: number, patch: ListingPatch): Promise<void> {
  const { status, note, pros, cons, ai_relevant, olx_status } = patch;
  const fields: string[] = [];
  const values: InValue[] = [];

  if (status !== undefined) {
    fields.push('status = ?', "status_source = 'manual'", 'miss_count = 0');
    values.push(status);
  }
  if (note !== undefined) {
    fields.push('note = ?');
    values.push(note);
  }
  if (pros !== undefined) {
    fields.push('pros = ?');
    values.push(pros);
  }
  if (cons !== undefined) {
    fields.push('cons = ?');
    values.push(cons);
  }
  if (ai_relevant !== undefined) {
    fields.push('ai_relevant = ?', "ai_relevant_source = 'manual'", "ai_relevant_at = datetime('now')");
    values.push(ai_relevant === null ? null : ai_relevant ? 1 : 0);
  }
  if (olx_status !== undefined) {
    fields.push('olx_status = ?');
    values.push(olx_status);
  }

  if (fields.length === 0) return;
  values.push(id);
  await dbRun(`UPDATE listings SET ${fields.join(', ')} WHERE id = ?`, values);
}

/** Непорожні `params` оголошень пошуку (JSON-рядки) — для конструктора діапазонів. */
export function listListingParams(searchId: number): Promise<{ params: string }[]> {
  return dbAll<{ params: string }>(
    "SELECT params FROM listings WHERE search_id = ? AND params IS NOT NULL AND params != '{}'",
    [searchId],
  );
}

/** Поля для варіантів фільтрів «Місто»/«Продавець»/«Плюси»/«Мінуси» — одним проходом по рядках пошуку. */
export function listFilterSourceRows(
  searchId: number,
): Promise<{ city: string | null; seller_name: string | null; pros: string | null; cons: string | null }[]> {
  return dbAll('SELECT city, seller_name, pros, cons FROM listings WHERE search_id = ?', [searchId]);
}
