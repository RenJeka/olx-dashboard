import { dbGet } from '../db/db.js';
import type { SearchConfig, ApiFilters } from '../types.js';

export interface SearchRow {
  id: number;
  name: string;
  query: string;
  category_id: number | null;
  api_filters: string;
  query_synonyms: string;
}

export async function loadSearch(id: number): Promise<SearchConfig | null> {
  const row = await dbGet<SearchRow>(
    'SELECT id, name, query, category_id, api_filters, query_synonyms FROM searches WHERE id = ?',
    [id],
  );

  if (!row) return null;

  let apiFilters: ApiFilters = {};
  try {
    apiFilters = JSON.parse(row.api_filters || '{}') as ApiFilters;
  } catch {
    apiFilters = {};
  }

  let querySynonyms: string[] = [];
  try {
    const parsed = JSON.parse(row.query_synonyms || '[]');
    if (Array.isArray(parsed)) querySynonyms = parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    querySynonyms = [];
  }

  return {
    id: row.id,
    name: row.name,
    query: row.query,
    categoryId: row.category_id,
    apiFilters,
    querySynonyms,
  };
}

/** Дедуплікація варіантів query (case-insensitive), порожні відкидаються. */
export function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const trimmed = q.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
