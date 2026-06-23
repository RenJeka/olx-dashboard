import { db } from '../db/db.js';
import type { ScanResult } from '../types.js';
import { loadSearch } from './searchLoader.js';
import { fetchAllQueries } from './fetchOrchestrator.js';
import { withScanRun } from './scanRunLifecycle.js';
import { finalizeScanResult } from './scanFinalize.js';

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

  return withScanRun(searchId, kind, async (ctx) => {
    const { raw, visibleTotalCount, note, requestsUsed, exhausted, usedGraphql, partial, bucketsUsed, rawCount, aborted } =
      await fetchAllQueries(search, {
        deep: options?.deep,
        onProgress: ctx.onProgress,
        shouldAbort: ctx.shouldAbort,
      });

    // Для runScan: якщо GraphQL-fallback → не оновлюємо facet.
    return finalizeScanResult({
      searchId,
      runId: ctx.runId,
      search,
      raw,
      rawTotal: rawCount,
      requestsUsed,
      usedGraphql,
      exhausted,
      partial,
      bucketsUsed,
      aborted,
      notes: note ? [note] : [],
      missThreshold: options?.deep ? 1 : 2,
      skipCategoryRefresh: !usedGraphql,
      visibleTotalCount,
    });
  });
}
