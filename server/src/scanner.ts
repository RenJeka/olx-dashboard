import { db } from './db/db.js';
import { GraphqlOlxFetcher } from './scraper/graphqlOlxFetcher.js';
import { HtmlOlxFetcher } from './scraper/olxFetcher.js';
import { upsertListings } from './scraper/normalizer.js';
import type { SearchConfig, ScanResult, ApiFilters, RawListing, FetchOptions } from './types.js';

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
  options?: FetchOptions,
): Promise<{
  raw: RawListing[];
  visibleTotalCount: number | null;
  fallbackNote: string | null;
  requestsUsed: number;
}> {
  try {
    const result = await graphqlFetcher.fetchSearch(search, options);
    return {
      raw: result.listings,
      visibleTotalCount: result.visibleTotalCount,
      fallbackNote: null,
      requestsUsed: result.requestsUsed,
    };
  } catch (graphqlErr) {
    const graphqlMessage =
      graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);

    try {
      const result = await htmlFetcher.fetchSearch(search, options);
      return {
        raw: result.listings,
        visibleTotalCount: result.visibleTotalCount,
        fallbackNote: `graphql failed: ${graphqlMessage}; fallback html OK`,
        requestsUsed: result.requestsUsed,
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
 *
 * `options.deep` — глибокий скан (батчі з паузами 3–6с, до min(50, ceil(visible_total_count/40))
 * запитів). Прогрес пишеться у scan_runs.requests_done/requests_total через onProgress —
 * фронтенд поллить GET /api/searches/:id/scan-status.
 */
export async function runScan(searchId: number, options?: { deep?: boolean }): Promise<ScanResult> {
  const search = loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at) VALUES (?, ?)')
      .run(searchId, new Date().toISOString()).lastInsertRowid,
  );

  const onProgress = (done: number, total: number): void => {
    db.prepare('UPDATE scan_runs SET requests_done = ?, requests_total = ? WHERE id = ?').run(
      done,
      total,
      runId,
    );
  };

  try {
    const { raw, visibleTotalCount, fallbackNote, requestsUsed } = await fetchWithFallback(search, {
      deep: options?.deep,
      onProgress,
    });
    const upsertResult = upsertListings(searchId, raw);
    const result: ScanResult = { ...upsertResult, requestsUsed };

    if (visibleTotalCount != null) {
      db.prepare('UPDATE searches SET visible_total_count = ? WHERE id = ?').run(
        visibleTotalCount,
        searchId,
      );
    }

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
