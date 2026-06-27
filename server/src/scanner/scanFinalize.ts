import { dbRun } from '../db/db.js';
import { fetchCategoryOptions } from '../scraper/olxCategories.js';
import { upsertListings } from '../scraper/normalizer.js';
import { applyScanStatuses } from '../scraper/statusEngine.js';
import type { SearchConfig, ScanResult, RawListing } from '../types.js';

/**
 * Best-effort оновлення дерева категорій OLX (facet) для пошуку після успішного скану.
 * Один легкий запит до OLX; результат кешується у searches.category_facet (фільтр категорій
 * читає його без мережі). Помилка/недоступність → лишаємо попереднє дерево, скан не валимо.
 * Тягнемо лише для основного `query` (синоніми дали б непорівнянні OLX-числа через перетин видач).
 */
export async function refreshCategoryFacet(searchId: number, query: string): Promise<void> {
  try {
    const categories = await fetchCategoryOptions(query);
    if (categories) {
      await dbRun('UPDATE searches SET category_facet = ? WHERE id = ?', [
        JSON.stringify(categories),
        searchId,
      ]);
    }
  } catch {
    // best-effort — дерево категорій не критичне для скану
  }
}

/**
 * Вхідні дані для фіналізації скану — спільний хвіст `runScan` і `runDeepScanFromPlan`.
 */
export interface FinalizeInput {
  searchId: number;
  runId: number;
  search: SearchConfig;
  raw: RawListing[];
  rawTotal: number;
  requestsUsed: number;
  usedGraphql: boolean;
  exhausted: boolean;
  partial: boolean;
  bucketsUsed?: number;
  aborted: boolean;
  /** visible_total_count з видачі OLX — оновлюємо в searches, якщо є. */
  visibleTotalCount?: number | null;
  notes: string[];
  /** Поріг miss_count для auto-disable: 1 для deep, 2 для normal (docs/plans/honest-olx-status.md). */
  missThreshold: number;
  /** Пропустити оновлення category_facet (напр. якщо був HTML-fallback без GraphQL). */
  skipCategoryRefresh?: boolean;
}

const UPDATE_VISIBLE_TOTAL_SQL = 'UPDATE searches SET visible_total_count = ? WHERE id = ?';

const FINALIZE_SUCCESS_SQL = `UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, raw_found = ?, disabled_count = ?, warning = ?, error = NULL,
     stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`;

/**
 * Спільний хвіст фіналізації скану для `runScan` і `runDeepScanFromPlan`:
 * upsert → applyScanStatuses → refreshCategoryFacet → UPDATE scan_runs.
 */
export async function finalizeScanResult(input: FinalizeInput): Promise<ScanResult> {
  const {
    searchId, runId, search, raw, rawTotal, requestsUsed,
    usedGraphql, exhausted, partial, bucketsUsed, aborted,
    notes, missThreshold, skipCategoryRefresh,
  } = input;

  const upsertResult = await upsertListings(searchId, raw);

  const stopped = aborted;
  const effectivePartial = partial || stopped;

  // Вікно покриття (CLAUDE.md): лише для ПОВНИХ успішних GraphQL-сканів — не fallback,
  // не часткових, не split. Поріг disable пропорційний надійності скану.
  const { disabled_count } = usedGraphql && !effectivePartial
    ? await applyScanStatuses(searchId, raw, exhausted, missThreshold)
    : { disabled_count: 0 };

  const result: ScanResult = {
    ...upsertResult,
    rawFound: rawTotal,
    requestsUsed,
    disabled_count,
    bucketsUsed,
    stopped,
  };

  // visible_total_count — оновлюємо лише якщо є (single-query non-split скан).
  if (input.visibleTotalCount != null) {
    await dbRun(UPDATE_VISIBLE_TOTAL_SQL, [input.visibleTotalCount, searchId]);
  }

  // Дерево категорій OLX (facet).
  if (!stopped && !skipCategoryRefresh) {
    await refreshCategoryFacet(searchId, search.query);
  }

  // Формування warning-ноти.
  if (stopped) {
    notes.unshift(`Зупинено користувачем — збережено ${result.found} оголошень`);
  }

  await dbRun(FINALIZE_SUCCESS_SQL, [
    new Date().toISOString(),
    result.found,
    result.new_count,
    result.rawFound ?? null,
    result.disabled_count,
    notes.length > 0 ? notes.join('; ') : null,
    runId,
  ]);

  return result;
}
