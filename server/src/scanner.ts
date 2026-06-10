import { db } from './db/db.js';
import { GraphqlOlxFetcher } from './scraper/graphqlOlxFetcher.js';
import { HtmlOlxFetcher } from './scraper/olxFetcher.js';
import { upsertListings } from './scraper/normalizer.js';
import type { SearchConfig, ScanResult, ApiFilters, RawListing } from './types.js';

const graphqlFetcher = new GraphqlOlxFetcher();
const htmlFetcher = new HtmlOlxFetcher();

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
 * Викликає GraphqlOlxFetcher; якщо він кидає помилку — fallback на HtmlOlxFetcher.
 * Якщо впав і fallback — кидає об'єднану помилку (обидва методи недоступні).
 */
async function fetchWithFallback(
  search: SearchConfig,
): Promise<{ raw: RawListing[]; fallbackNote: string | null }> {
  try {
    const raw = await graphqlFetcher.fetchSearch(search);
    return { raw, fallbackNote: null };
  } catch (graphqlErr) {
    const graphqlMessage =
      graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);

    try {
      const raw = await htmlFetcher.fetchSearch(search);
      return {
        raw,
        fallbackNote: `graphql failed: ${graphqlMessage}; fallback html OK`,
      };
    } catch (htmlErr) {
      const htmlMessage = htmlErr instanceof Error ? htmlErr.message : String(htmlErr);
      throw new Error(
        `graphql failed: ${graphqlMessage}; html fallback failed: ${htmlMessage}`,
      );
    }
  }
}

/**
 * Запускає сканування пошуку: fetcher (GraphQL → HTML fallback) → normalizer → запис scan_run.
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
    const { raw, fallbackNote } = await fetchWithFallback(search);
    const result = upsertListings(searchId, raw);

    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, error = ? WHERE id = ?',
    ).run(new Date().toISOString(), result.found, result.new_count, fallbackNote, runId);

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, error = ? WHERE id = ?',
    ).run(new Date().toISOString(), message, runId);
    throw err;
  }
}
