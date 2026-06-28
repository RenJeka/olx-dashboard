import { dbAll, dbGet, dbRun } from '../db/db.js';
import type { PickCandidate } from '../types.js';
import { PICK_CANDIDATES_LIMIT } from './constants.js';

export interface ListingRow {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
}

export async function getSearch(
  id: number,
): Promise<{ id: number; name: string; analysis_criteria: string } | undefined> {
  return dbGet<{ id: number; name: string; analysis_criteria: string }>(
    'SELECT id, name, analysis_criteria FROM searches WHERE id = ?',
    [id],
  );
}

export async function getSavedCriteria(searchId: number): Promise<{ cons: string[]; pros: string[] }> {
  const row = await dbGet<{ analysis_criteria: string }>(
    'SELECT analysis_criteria FROM searches WHERE id = ?',
    [searchId],
  );
  try {
    const parsed = JSON.parse(row?.analysis_criteria || '{}') as { cons?: string[]; pros?: string[] };
    return { cons: parsed.cons ?? [], pros: parsed.pros ?? [] };
  } catch {
    return { cons: [], pros: [] };
  }
}

/**
 * Цільовий товар семантичного фільтра. Якщо relevance_target порожній — повертаємо query
 * пошуку як передзаповнення (щоб перший прогін мав осмислену ціль).
 */
export async function getRelevanceTarget(searchId: number): Promise<string> {
  const row = await dbGet<{ relevance_target: string | null; query: string }>(
    'SELECT relevance_target, query FROM searches WHERE id = ?',
    [searchId],
  );
  if (!row) return '';
  return (row.relevance_target ?? '').trim() || row.query;
}

/** Зберігає цільовий товар на рівні пошуку (для повторних прогонів). */
export async function setRelevanceTarget(searchId: number, target: string): Promise<void> {
  await dbRun('UPDATE searches SET relevance_target = ? WHERE id = ?', [target, searchId]);
}

/**
 * Синоніми query (docs/plans/search-synonyms.md) як alias-назви товару для AI-фільтра
 * релевантності — оголошення, що продає товар під будь-яким із синонімів, теж релевантне.
 */
export async function getRelevanceAliases(searchId: number): Promise<string[]> {
  const row = await dbGet<{ query_synonyms: string | null }>(
    'SELECT query_synonyms FROM searches WHERE id = ?',
    [searchId],
  );
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.query_synonyms || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
  } catch {
    return [];
  }
}

/** Завантажує оголошення за id (або всі пошуку, якщо ids порожній). */
export async function loadListings(searchId: number, ids: number[]): Promise<ListingRow[]> {
  if (ids.length === 0) {
    return dbAll<ListingRow>('SELECT id, title, description, params FROM listings WHERE search_id = ?', [
      searchId,
    ]);
  }
  const placeholders = ids.map(() => '?').join(',');
  return dbAll<ListingRow>(
    `SELECT id, title, description, params FROM listings WHERE search_id = ? AND id IN (${placeholders})`,
    [searchId, ...ids],
  );
}

/**
 * Кандидати для AI-ранжування: без мінусів, активні, не відфільтровані, релевантні
 * (`ai_relevant IS NOT 0` лишає 1 та NULL-«не перевірено», відсікає нерелевантні),
 * відсортовані за ціною ASC (NULL-ціна в кінці), ліміт PICK_CANDIDATES_LIMIT.
 * Предикат збігається з вкладкою «Найкращі кандидати» в UI.
 */
export async function loadPickCandidates(searchId: number): Promise<PickCandidate[]> {
  return dbAll<PickCandidate>(
    `SELECT id, title, price, city, params, description, pros
       FROM listings
       WHERE search_id = ? AND cons = '' AND status NOT IN ('disabled','rejected')
         AND filtered_out = 0 AND ai_relevant IS NOT 0
       ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC
       LIMIT ?`,
    [searchId, PICK_CANDIDATES_LIMIT],
  );
}
