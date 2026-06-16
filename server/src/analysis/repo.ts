import { db } from '../db/db.js';

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
