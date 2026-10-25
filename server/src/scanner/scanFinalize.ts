import { dbRun } from '../db/db.js';
import { logWarn } from '../logger.js';
import { refreshBaseCategory, upsertCategories } from '../categories/tree.js';
import { fetchCategoryFacet } from '../scraper/graphql/categories.js';
import { facetToNodes, facetToOptions } from '../scraper/olxCategories.js';
import { upsertListings } from '../scraper/normalizer.js';
import { applyScanStatuses } from '../scraper/statusEngine.js';
import type { SearchConfig, ScanResult, RawListing, PriceCoverage } from '../types.js';
import type { ScanPersister } from './scanPersister.js';

/** Поріг промахів для повного покриття split-/синонімного скану (рішення людини 2026-10-25). */
export const FULL_COVERAGE_MISS_THRESHOLD = 2;

/**
 * Best-effort оновлення дерева категорій OLX (facet) для пошуку після успішного скану.
 * Один легкий GraphQL-запит до OLX (facets, olx-api.md §2.11); результат кешується у
 * searches.category_facet (фільтр категорій читає його без мережі), а вузли дерева — у глобальній
 * olx_categories (пише лише нові/змінені). Помилка/недоступність → лишаємо попереднє дерево, скан не валимо.
 * Тягнемо лише для основного `query` (синоніми дали б непорівнянні OLX-числа через перетин видач).
 */
export async function refreshCategoryFacet(searchId: number, query: string): Promise<void> {
  try {
    const facet = await fetchCategoryFacet(query);
    if (facet) {
      await dbRun('UPDATE searches SET category_facet = ? WHERE id = ?', [
        JSON.stringify(facetToOptions(facet)),
        searchId,
      ]);
      await upsertCategories(facetToNodes(facet));
    }
  } catch (err) {
    // best-effort — дерево категорій не критичне для скану; але збій має бути видимим у журналі
    logWarn('scanner', 'category-facet', err instanceof Error ? err.message : String(err), {
      searchId,
    });
  }
}

/** Best-effort перерахунок автокатегорії пошуку (базові плюси/мінуси); збій — лише в журнал. */
async function refreshBaseCategorySafe(searchId: number): Promise<void> {
  try {
    await refreshBaseCategory(searchId);
  } catch (err) {
    logWarn('scanner', 'base-category', err instanceof Error ? err.message : String(err), { searchId });
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
  /** Поріг miss_count для auto-disable: 1 для deep, 2 для normal (docs/plans/old/honest-olx-status.md). */
  missThreshold: number;
  /**
   * Повне покриття split- чи синонімного скану (усі варіанти й бакети вичерпано): часткова
   * для вікна покриття видача все одно доводить відсутність у межах цих цін — вимкнення зниклих
   * з порогом FULL_COVERAGE_MISS_THRESHOLD (docs/plans/verify-graphql.md).
   */
  priceCoverage?: PriceCoverage;
  /** Пропустити оновлення category_facet (напр. якщо був HTML-fallback без GraphQL). */
  skipCategoryRefresh?: boolean;
  /**
   * Інкрементальний persister цього скану (docs/plans/old/scan-failure-recovery.md): фінальний
   * flush дозаписує ще не збережене, лічильники found/new_count беруться накопиченими за
   * весь скан (проміжні флаші вже записали частину). Без нього — одноразовий upsert як раніше.
   */
  persister?: ScanPersister;
}

const UPDATE_VISIBLE_TOTAL_SQL = 'UPDATE searches SET visible_total_count = ? WHERE id = ?';

const FINALIZE_SUCCESS_SQL = `UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, raw_found = ?, disabled_count = ?, warning = ?, error = NULL,
     stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`;

/**
 * Спільний хвіст фіналізації скану для `runScan` і `runDeepScanFromPlan`:
 * upsert → applyScanStatuses → refreshCategoryFacet → refreshBaseCategory → UPDATE scan_runs.
 */
export async function finalizeScanResult(input: FinalizeInput): Promise<ScanResult> {
  const {
    searchId, runId, search, raw, rawTotal, requestsUsed,
    usedGraphql, exhausted, partial, bucketsUsed, aborted,
    notes, missThreshold, skipCategoryRefresh, persister,
  } = input;

  let upsertResult: Pick<ScanResult, 'found' | 'new_count'>;
  if (persister) {
    await persister.flush(raw);
    upsertResult = persister.totals;
  } else {
    upsertResult = await upsertListings(searchId, raw);
  }

  const stopped = aborted;
  const effectivePartial = partial || stopped;

  // Вікно покриття (CLAUDE.md): лише для ПОВНИХ успішних GraphQL-сканів однієї видачі — не fallback,
  // не часткових. Поріг disable пропорційний надійності скану. Split-/синонімний скан — лише за повного
  // покриття, у його ціновому діапазоні й з порогом 2: ціна могла змінитись посеред скану й перенести
  // оголошення в уже пройдений бакет (docs/plans/verify-graphql.md).
  let disabled_count = 0;
  if (usedGraphql && !effectivePartial) {
    ({ disabled_count } = await applyScanStatuses(searchId, raw, exhausted, missThreshold));
  } else if (usedGraphql && !stopped && input.priceCoverage) {
    ({ disabled_count } = await applyScanStatuses(searchId, raw, true, FULL_COVERAGE_MISS_THRESHOLD, input.priceCoverage));
    notes.push(`повне покриття: зниклі отримали промах (вимкнення після ${FULL_COVERAGE_MISS_THRESHOLD} поспіль)`);
  }

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
  // Автокатегорія — з оголошень у БД, тож не залежить від facet; рахуємо й після зупиненого скану. Без нових
  // оголошень і з уже відомою автокатегорією розподіл не змінився — пропускаємо GROUP BY (Turso-економія);
  // зміну фільтра «Категорії» перераховує сам PATCH пошуку.
  if (upsertResult.new_count > 0 || search.baseCategoryId == null) {
    await refreshBaseCategorySafe(searchId);
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
