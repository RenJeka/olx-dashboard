import { db } from './db/db.js';
import { HtmlOlxFetcher } from './scraper/olxFetcher.js';
import { upsertListings } from './scraper/normalizer.js';
import type { SearchConfig, ScanResult, ApiFilters } from './types.js';

const fetcher = new HtmlOlxFetcher();

interface SearchRow {
  id: number;
  name: string;
  query: string;
  category_id: number | null;
  api_filters: string;
}

function loadSearch(id: number): SearchConfig | null {
  const row = db
    .prepare('SELECT id, name, query, category_id, api_filters FROM searches WHERE id = ?')
    .get(id) as SearchRow | undefined;

  if (!row) return null;

  let apiFilters: ApiFilters = {};
  try {
    apiFilters = JSON.parse(row.api_filters || '{}') as ApiFilters;
  } catch {
    apiFilters = {};
  }

  return {
    id: row.id,
    name: row.name,
    query: row.query,
    categoryId: row.category_id,
    apiFilters,
  };
}

/**
 * Запускає сканування пошуку: fetcher → normalizer → запис scan_run.
 * Помилки скрейпінгу пишуться у scan_runs.error і прокидаються нагору
 * (роут мапить на 500), процес НЕ валиться.
 */
export async function runScan(searchId: number): Promise<ScanResult> {
  const search = loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at) VALUES (?, ?)')
      .run(searchId, new Date().toISOString()).lastInsertRowid,
  );

  try {
    const raw = await fetcher.fetchSearch(search);
    const result = upsertListings(searchId, raw);

    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ? WHERE id = ?',
    ).run(new Date().toISOString(), result.found, result.new_count, runId);

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, error = ? WHERE id = ?',
    ).run(new Date().toISOString(), message, runId);
    throw err;
  }
}
