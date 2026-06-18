import { db } from '../db/db.js';
import type { PickCandidate } from '../types.js';
import { PICK_CANDIDATES_LIMIT } from './constants.js';

export interface ListingRow {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
}

export function getSearch(id: number): { id: number; name: string; analysis_criteria: string } | undefined {
  return db.prepare('SELECT id, name, analysis_criteria FROM searches WHERE id = ?').get(id) as
    | { id: number; name: string; analysis_criteria: string }
    | undefined;
}

export function getSavedCriteria(searchId: number): { cons: string[]; pros: string[] } {
  const row = db.prepare('SELECT analysis_criteria FROM searches WHERE id = ?').get(searchId) as
    | { analysis_criteria: string }
    | undefined;
  try {
    const parsed = JSON.parse(row?.analysis_criteria || '{}') as { cons?: string[]; pros?: string[] };
    return { cons: parsed.cons ?? [], pros: parsed.pros ?? [] };
  } catch {
    return { cons: [], pros: [] };
  }
}

/** Завантажує оголошення за id (або всі пошуку, якщо ids порожній). */
export function loadListings(searchId: number, ids: number[]): ListingRow[] {
  if (ids.length === 0) {
    return db
      .prepare('SELECT id, title, description, params FROM listings WHERE search_id = ?')
      .all(searchId) as ListingRow[];
  }
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id, title, description, params FROM listings WHERE search_id = ? AND id IN (${placeholders})`,
    )
    .all(searchId, ...ids) as ListingRow[];
}

/**
 * Кандидати для AI-ранжування: без мінусів, активні, не відфільтровані,
 * відсортовані за ціною ASC (NULL-ціна в кінці), ліміт PICK_CANDIDATES_LIMIT.
 */
export function loadPickCandidates(searchId: number): PickCandidate[] {
  return db
    .prepare(
      `SELECT id, title, price, city, params, description, pros
       FROM listings
       WHERE search_id = ? AND cons = '' AND status NOT IN ('disabled','rejected')
         AND filtered_out = 0
       ORDER BY CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC
       LIMIT ?`,
    )
    .all(searchId, PICK_CANDIDATES_LIMIT) as PickCandidate[];
}
