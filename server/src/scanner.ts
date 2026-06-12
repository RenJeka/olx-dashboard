import { db } from './db/db.js';
import { GraphqlOlxFetcher } from './scraper/graphqlOlxFetcher.js';
import { HtmlOlxFetcher } from './scraper/olxFetcher.js';
import { upsertListings } from './scraper/normalizer.js';
import { applyScanStatuses } from './scraper/statusEngine.js';
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
  note: string | null;
  requestsUsed: number;
  exhausted: boolean;
  usedGraphql: boolean;
}> {
  try {
    const result = await graphqlFetcher.fetchSearch(search, options);
    return {
      raw: result.listings,
      visibleTotalCount: result.visibleTotalCount,
      note: result.warning ?? null,
      requestsUsed: result.requestsUsed,
      exhausted: result.exhausted,
      usedGraphql: true,
    };
  } catch (graphqlErr) {
    const graphqlMessage =
      graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);

    try {
      const result = await htmlFetcher.fetchSearch(search, options);
      const notes = [`graphql failed: ${graphqlMessage}; fallback html OK`];
      if (result.warning) notes.push(result.warning);
      return {
        raw: result.listings,
        visibleTotalCount: result.visibleTotalCount,
        note: notes.join('; '),
        requestsUsed: result.requestsUsed,
        exhausted: result.exhausted,
        usedGraphql: false,
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

  const kind = options?.deep ? 'deep' : 'normal';

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)')
      .run(searchId, new Date().toISOString(), kind).lastInsertRowid,
  );

  const onProgress = (done: number, total: number): void => {
    db.prepare('UPDATE scan_runs SET requests_done = ?, requests_total = ? WHERE id = ?').run(
      done,
      total,
      runId,
    );
  };

  try {
    const { raw, visibleTotalCount, note, requestsUsed, exhausted, usedGraphql } =
      await fetchWithFallback(search, {
        deep: options?.deep,
        onProgress,
      });
    const upsertResult = upsertListings(searchId, raw);

    // Вікно покриття (CLAUDE.md): лише для успішних GraphQL-сканів, не fallback.
    const { disabled_count } = usedGraphql
      ? applyScanStatuses(searchId, raw, exhausted)
      : { disabled_count: 0 };

    const result: ScanResult = { ...upsertResult, requestsUsed, disabled_count };

    if (visibleTotalCount != null) {
      db.prepare('UPDATE searches SET visible_total_count = ? WHERE id = ?').run(
        visibleTotalCount,
        searchId,
      );
    }

    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, disabled_count = ?, error = ? WHERE id = ?',
    ).run(
      new Date().toISOString(),
      result.found,
      result.new_count,
      result.disabled_count,
      note,
      runId,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      'UPDATE scan_runs SET finished_at = ?, error = ? WHERE id = ?',
    ).run(new Date().toISOString(), message, runId);
    throw err;
  }
}
