import { randomUUID } from 'node:crypto';
import { dbGet, dbRun } from '../db/db.js';
import { estimatePages } from '../scraper/graphql/fetcher.js';
import { MAX_PAGES } from '../scraper/graphql/constants.js';
import type { SplitPlan } from '../scraper/graphql/types.js';
import { selectKnownOlxIds } from '../scraper/normalizer.js';
import { interruptibleSleep, randomDelayMs } from '../scraper/utils.js';
import {
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
  DEEP_SCAN_SECONDS_PER_REQUEST,
} from '../scraper/constants.js';
import type {
  SearchConfig,
  ScanResult,
  FetchOptions,
  ScanProgress,
  ScanPlan,
  ScanPlanQuery,
  PriceBucketSummary,
  RawListing,
} from '../types.js';
import { loadSearch, dedupeQueries } from './searchLoader.js';
import { graphqlFetcher, htmlFetcher } from './fetchOrchestrator.js';
import { withScanRun } from './scanRunLifecycle.js';
import { finalizeScanResult } from './scanFinalize.js';
import { runScan } from './runScan.js';

// ── Двофазний глибокий скан: аналіз → звіт → підтверджений запуск ────────────
// (docs/plans/two-phase-deep-scan.md). Аналітична фаза (analyzeScan) виконує лише probe
// (root + межі ціни + бісекція) і кешує SplitPlan-и на сервері — runDeepScanFromPlan
// довершує збір за тим самим планом, не повторюючи жодного probe-запиту.

interface CachedPlan {
  searchId: number;
  plans: { query: string; plan: SplitPlan }[];
  createdAt: number;
}

/** Скільки хвилин живе закешований план аналізу (дзеркалить SCAN_PLAN_TTL_MIN у web/src/constants.ts). */
const PLAN_TTL_MIN = 30;
/** Single-user локальний застосунок — in-memory кеш планів допустимий (без Redis/БД). */
const PLAN_TTL_MS = PLAN_TTL_MIN * 60 * 1000;
const planCache = new Map<string, CachedPlan>();

function cleanupExpiredPlans(): void {
  const now = Date.now();
  for (const [token, cached] of planCache) {
    if (now - cached.createdAt > PLAN_TTL_MS) planCache.delete(token);
  }
}

/**
 * Чи ще є швидкий (in-memory) план під цим токеном — дозволяє `runDeepScanFromPlan` довершити
 * скан БЕЗ повторного зондування. Кеш втрачається при перезапуску процесу й після одноразового
 * запуску; валідність звіту для UI більше НЕ залежить від нього (див. `isAnalysisFresh`).
 */
export function isPlanCached(planToken: string): boolean {
  cleanupExpiredPlans();
  return planCache.has(planToken);
}

/**
 * Чи аналіз ще «свіжий» за часом завершення (у межах TTL) — time-based валідність звіту для UI.
 * НЕ прив'язана до in-memory кешу: звіт лишається запускним протягом TTL навіть після
 * перезапуску сервера чи закриття діалогу — `runDeepScanFromPlan` за потреби перезондує
 * (docs/plans/two-phase-deep-scan.md).
 */
export function isAnalysisFresh(finishedAt: string | null | undefined): boolean {
  if (!finishedAt) return false;
  const t = Date.parse(finishedAt);
  return Number.isFinite(t) && Date.now() - t < PLAN_TTL_MS;
}

// ── SQL для фіналізації analyze-скану ────────────────────────────────────────
const FINALIZE_ANALYZE_SQL = `UPDATE scan_runs SET finished_at = ?, found = 0, new_count = 0, warning = ?, scan_plan = ?, error = NULL,
     stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`;

/**
 * Обробляє один варіант query в циклі analyze-скану: probe + агрегація метрик.
 * Повертає `ScanPlanQuery` для звіту + інкременти для зовнішніх лічильників.
 */
async function analyzeVariant(
  search: SearchConfig,
  variant: string,
  vi: number,
  variantsCount: number,
  globalSampleIds: Set<number>,
  onProgress: (p: ScanProgress) => void,
  requestsUsedBefore: number,
  shouldAbort: () => boolean,
): Promise<{
  plan: SplitPlan;
  planQuery: ScanPlanQuery;
  requestsUsed: number;
  knownSampleCount: number;
  sampleTotal: number;
  sampleSize: number;
  totalListings: number;
  totalBuckets: number;
  remainingRequests: number;
  warning?: string;
}> {
  const variantSearch: SearchConfig = { ...search, query: variant };
  const onVariantProgress: FetchOptions['onProgress'] = (p) =>
    onProgress({
      done: requestsUsedBefore + p.done,
      stage: `Аналіз «${variant}» (${vi + 1}/${variantsCount})${p.stage ? ` · ${p.stage}` : ''}`,
      subDone: vi + 1,
      subTotal: variantsCount,
    });

  let plan: SplitPlan;
  let warning: string | undefined;
  try {
    plan = await graphqlFetcher.analyzeSplit(variantSearch, { onProgress: onVariantProgress, shouldAbort });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warning = `«${variant}»: аналіз GraphQL не вдався (${message}) — повний скан спробує ще раз і перейде на HTML, якщо потрібно`;
    plan = {
      rootCount: null,
      buckets: [],
      rootItems: [],
      requestsUsed: 0,
      noSplit: true,
      fallbackReason: `graphql analyze failed: ${message}`,
    };
  }

  const bucketSummaries: PriceBucketSummary[] = plan.buckets.map((b) => ({
    from: b.from,
    to: b.to,
    count: b.count,
  }));

  // Запитів допагінації лишилось: бакети/корінь мінус уже завантажена 0-а сторінка кожного.
  const variantRemaining = plan.noSplit
    ? plan.rootCount != null
      ? Math.max(0, estimatePages(plan.rootCount) - 1)
      : 0
    : plan.buckets.reduce((sum, b) => sum + Math.max(0, estimatePages(b.count) - 1), 0);

  // Семпл «~нових»: 0-і сторінки бакетів (split) або rootItems (noSplit, успішний аналіз).
  const sampleItems = plan.noSplit ? plan.rootItems : plan.buckets.flatMap((b) => b.page0);

  // Внесок варіанта в унікальні: olxId вибірки, яких ще не було в попередніх варіантах.
  let sampleUnique: number | null = null;
  let knownSampleCount = 0;
  let sampleTotal = 0;
  if (sampleItems.length > 0) {
    sampleUnique = 0;
    for (const it of sampleItems) {
      if (!globalSampleIds.has(it.olxId)) {
        globalSampleIds.add(it.olxId);
        sampleUnique++;
      }
    }
    const known = await selectKnownOlxIds(sampleItems.map((it) => it.olxId));
    knownSampleCount = known.size;
    sampleTotal = sampleItems.length;
  }

  return {
    plan,
    planQuery: {
      query: variant,
      rootCount: plan.rootCount,
      buckets: bucketSummaries,
      noSplit: plan.noSplit,
      fallbackReason: plan.fallbackReason,
      remainingRequests: variantRemaining,
      sampleUnique,
    },
    requestsUsed: plan.requestsUsed,
    knownSampleCount,
    sampleTotal,
    sampleSize: sampleItems.length,
    totalListings: plan.rootCount ?? 0,
    totalBuckets: plan.buckets.length,
    remainingRequests: variantRemaining,
    warning,
  };
}

/**
 * Аналітична (probe) фаза глибокого скану: для основного query + кожного синоніма викликає
 * `GraphqlOlxFetcher.analyzeSplit` (root-зондування + межі ціни + бісекція — БЕЗ допагінації
 * листів), агрегує підсумок у `ScanPlan` (звіт ScanPlanReportDialog) і кешує `SplitPlan`-и під
 * `planToken` (TTL), щоб `runDeepScanFromPlan` міг довершити збір без повторного зондування.
 * GraphQL-збій під час аналізу одного варіанта — НЕ валить увесь аналіз: варіант позначається
 * `noSplit` + `fallbackReason`, а HTML-fallback (як і для звичайного скану) спрацьовує пізніше,
 * на стадії `runDeepScanFromPlan`, якщо повторна спроба теж впаде.
 */
export async function analyzeScan(searchId: number, options?: { deep?: boolean }): Promise<ScanPlan> {
  const search = await loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  cleanupExpiredPlans();

  const variants = dedupeQueries([search.query, ...(search.querySynonyms ?? [])]);

  return withScanRun(searchId, 'analyze', async (ctx) => {
    const perQuery: ScanPlanQuery[] = [];
    const plans: { query: string; plan: SplitPlan }[] = [];
    let requestsUsed = 0;
    let totalListings = 0;
    let totalBuckets = 0;
    let remainingRequests = 0;
    let knownSampleCount = 0;
    let sampleTotal = 0;
    // Глобальний дедуп вибірки між варіантами: оцінити частку унікальних після злиття синонімів.
    const globalSampleIds = new Set<number>();
    let sumSampleSize = 0;
    const warnings: string[] = [];

    for (let vi = 0; vi < variants.length; vi++) {
      if (ctx.shouldAbort()) {
        throw new Error('Аналіз зупинено користувачем');
      }
      const variant = variants[vi] as string;

      const result = await analyzeVariant(
        search, variant, vi, variants.length,
        globalSampleIds, ctx.onProgress, requestsUsed, ctx.shouldAbort,
      );

      plans.push({ query: variant, plan: result.plan });
      perQuery.push(result.planQuery);
      requestsUsed += result.requestsUsed;
      totalListings += result.totalListings;
      totalBuckets += result.totalBuckets;
      remainingRequests += result.remainingRequests;
      knownSampleCount += result.knownSampleCount;
      sampleTotal += result.sampleTotal;
      sumSampleSize += result.sampleSize;
      if (result.warning) warnings.push(result.warning);

      if (vi < variants.length - 1) {
        const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
        ctx.onProgress({
          done: requestsUsed,
          stage: `Пауза між варіантами ~${Math.round(delay / 1000)}с`,
          subDone: vi + 1,
          subTotal: variants.length,
        });
        await interruptibleSleep(delay, ctx.shouldAbort);
      }
    }

    // Зупинка під час бісекції ОСТАННЬОГО варіанта: bisectPriceRange виходить тихо й повертає
    // обрізані бакети, а перевірки на початку наступної ітерації вже не буде — без цієї пост-
    // циклової перевірки обрізаний план зберігся б як завершений аналіз (GET /last-analysis
    // віддав би його запускним). Кидаємо як інші зупинки → catch запише error, план НЕ зберігає.
    if (ctx.shouldAbort()) {
      throw new Error('Аналіз зупинено користувачем');
    }

    // Невідфільтрований тотал головного query — щоб звіт показав «N у вашому фільтрі ціни / ~M
    // всього на OLX» і не виникало хибного відчуття недозбору при порівнянні з сайтом.
    let unfilteredTotal: number | null = null;
    const priceRange = search.apiFilters.ranges?.price;
    if (priceRange && (priceRange.from != null || priceRange.to != null)) {
      try {
        const { price: _omitPrice, ...rangesWithoutPrice } = search.apiFilters.ranges ?? {};
        const stripped: SearchConfig = {
          ...search,
          apiFilters: { ...search.apiFilters, ranges: rangesWithoutPrice },
        };
        unfilteredTotal = await graphqlFetcher.probeRootCount(stripped);
      } catch {
        // Інформаційний probe — помилка не зриває аналіз.
      }
    }

    const planToken = randomUUID();
    planCache.set(planToken, { searchId, plans, createdAt: Date.now() });

    const hasSample = sumSampleSize > 0;
    const estimatedNew = hasSample && sampleTotal > 0
      ? Math.round(((sampleTotal - knownSampleCount) / sampleTotal) * totalListings)
      : null;

    // Оцінка унікальних після дедупу між синонімами: частка унікальних у вибірці × сума.
    const estimatedUnique = hasSample && sumSampleSize > 0
      ? Math.round((globalSampleIds.size / sumSampleSize) * totalListings)
      : null;

    // Калібрування реальними даними: останній завершений нормальний скан (не аналітичний).
    const lastScan = await dbGet<{ raw_found: number | null; found: number | null }>(
      `SELECT raw_found, found FROM scan_runs
       WHERE search_id = ? AND kind != 'analyze' AND finished_at IS NOT NULL AND found IS NOT NULL
       ORDER BY finished_at DESC LIMIT 1`,
      [searchId],
    );

    const partial =
      variants.length > 1 ||
      totalBuckets > 0 ||
      perQuery.some((q) => q.fallbackReason != null);
    if (variants.length > 1) warnings.push('вікно покриття буде пропущено (union кількох видач)');

    const scanPlan: ScanPlan = {
      planToken,
      perQuery,
      totalListings,
      totalBuckets,
      remainingRequests,
      estimatedDurationSec: remainingRequests * DEEP_SCAN_SECONDS_PER_REQUEST,
      estimatedNew,
      estimatedNewIsSample: true,
      estimatedUnique,
      lastScanRaw: lastScan?.raw_found ?? null,
      lastScanUnique: lastScan?.found ?? null,
      unfilteredTotal,
      partial,
      warnings,
    };

    // Зберігаємо повний ScanPlan у scan_runs.scan_plan — для перегляду останнього аналізу
    // після закриття діалогу (GET /last-analysis, docs/plans/deep-scan-stop-and-history.md).
    await dbRun(FINALIZE_ANALYZE_SQL, [
      new Date().toISOString(),
      warnings.length > 0 ? warnings.join('; ') : null,
      JSON.stringify(scanPlan),
      ctx.runId,
    ]);

    return scanPlan;
  });
}

/**
 * Стабільна оцінка кількості HTTP-запитів, які `scanFromPlan` зробить для одного варіанта
 * (для наперед-порахованого `requests_total`, щоб лічильник не стрибав — bug «103/3»):
 * - `noSplit` → `scanFromPlan` делегує `fetchSearch` (пагінація з 0-ї сторінки): `estimatePages(rootCount)`,
 *   а без `rootCount` (аналіз варіанта впав) — `MAX_PAGES` як верхня межа;
 * - split → probe вже зроблено (`plan.requestsUsed`) + допагінація бакетів (без уже завантажених 0-х сторінок).
 */
function estimateRunRequests(plan: SplitPlan): number {
  if (plan.noSplit) {
    return plan.rootCount != null ? estimatePages(plan.rootCount) : MAX_PAGES;
  }
  return (
    plan.requestsUsed +
    plan.buckets.reduce((sum, b) => sum + Math.max(0, estimatePages(b.count) - 1), 0)
  );
}

/**
 * Довершує глибокий скан за раніше зібраним планом (`analyzeScan`): для кожного варіанта query
 * викликає `GraphqlOlxFetcher.scanFromPlan` (жодного повторного probe-запиту), зливає по
 * `olxId`, далі стандартний хвіст (upsert, `applyScanStatuses`, `refreshCategoryFacet`,
 * фіналізація `scan_runs` з `kind='deep'`).
 *
 * Якщо швидкого in-memory плану під токеном уже немає (TTL-edge, перезапуск сервера або повторний
 * запуск), але аналіз ще «свіжий» за часом (`isAnalysisFresh`) — робимо повний глибокий скан
 * із повторним зондуванням (`runScan deep`). Тільки коли аналіз справді протермінований (> TTL) —
 * зрозуміла помилка «повторіть аналіз».
 */
export async function runDeepScanFromPlan(searchId: number, planToken: string): Promise<ScanResult> {
  cleanupExpiredPlans();
  const cached = planCache.get(planToken);
  if (!cached || cached.searchId !== searchId) {
    const lastAnalyze = await dbGet<{ finished_at: string | null }>(
      `SELECT finished_at FROM scan_runs
       WHERE search_id = ? AND kind = 'analyze' AND scan_plan IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [searchId],
    );
    if (lastAnalyze && isAnalysisFresh(lastAnalyze.finished_at)) {
      return runScan(searchId, { deep: true });
    }
    throw new Error('План застарів або не знайдено — повторіть аналіз');
  }
  planCache.delete(planToken);

  const search = await loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  return withScanRun(searchId, 'deep', async (ctx) => {
    const variants = cached.plans;
    const merged = new Map<number, RawListing>();
    let requestsUsed = 0;
    let usedGraphql = true;
    let allExhausted = true;
    let bucketsUsed = 0;
    let rawTotal = 0;
    let aborted = false;
    let visibleTotalCount: number | null = null;
    let partial = variants.length > 1;
    const notes: string[] = variants.length > 1
      ? [`multi-query: ${variants.length} варіантів запиту змерджено`]
      : [];

    // Стабільний орієнтовний total на весь скан — рахуємо наперед із кешованих планів, щоб
    // `requests_total` не стрибав униз між варіантами (bug «103/3»).
    const plannedTotal = variants.reduce((sum, e) => sum + estimateRunRequests(e.plan), 0);
    ctx.onProgress({
      done: 0,
      total: plannedTotal,
      subTotal: variants.length,
      stage: 'Підготовка…',
    });

    for (let vi = 0; vi < variants.length; vi++) {
      if (ctx.shouldAbort()) {
        aborted = true;
        break;
      }
      const entry = variants[vi] as { query: string; plan: SplitPlan };
      const variant = entry.query;
      const variantSearch: SearchConfig = { ...search, query: variant };
      const onVariantProgress: FetchOptions['onProgress'] = (p) => {
        const done = requestsUsed + p.done;
        ctx.onProgress({
          done,
          total: Math.max(plannedTotal, done),
          method: p.method ?? 'GraphQL',
          stage:
            variants.length > 1
              ? `Синонім «${variant}» (${vi + 1}/${variants.length})${p.stage ? ` · ${p.stage}` : ''}`
              : p.stage,
          subDone: variants.length > 1 ? vi + 1 : p.subDone,
          subTotal: variants.length > 1 ? variants.length : p.subTotal,
        });
      };

      let raw: RawListing[];
      let result: { visibleTotalCount: number | null; requestsUsed: number; exhausted: boolean; warning?: string; bucketsUsed?: number; aborted?: boolean };
      try {
        const splitResult = await graphqlFetcher.scanFromPlan(variantSearch, entry.plan, {
          onProgress: onVariantProgress,
          shouldAbort: ctx.shouldAbort,
        });
        raw = splitResult.listings;
        result = splitResult;
      } catch (graphqlErr) {
        const graphqlMessage = graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);
        const htmlResult = await htmlFetcher.fetchSearch(variantSearch, {
          onProgress: (p) => onVariantProgress({ ...p, method: 'HTML' }),
          shouldAbort: ctx.shouldAbort,
        });
        raw = htmlResult.listings;
        result = { ...htmlResult, warning: [`graphql failed: ${graphqlMessage}; fallback html OK`, htmlResult.warning].filter(Boolean).join('; ') };
        usedGraphql = false;
      }

      for (const item of raw) merged.set(item.olxId, item);
      requestsUsed += result.requestsUsed;
      rawTotal += raw.length;
      if (!result.exhausted) allExhausted = false;
      if (result.bucketsUsed) bucketsUsed += result.bucketsUsed;
      if (result.warning) {
        notes.push(variants.length > 1 ? `«${variant}»: ${result.warning}` : result.warning);
        if (variants.length === 1) partial = true;
      }
      if (variants.length === 1) visibleTotalCount = result.visibleTotalCount;

      if (result.aborted) {
        aborted = true;
        break;
      }

      if (vi < variants.length - 1) {
        const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
        ctx.onProgress({
          done: requestsUsed,
          stage: `Пауза між синонімами ~${Math.round(delay / 1000)}с`,
          subDone: vi + 1,
          subTotal: variants.length,
        });
        await interruptibleSleep(delay, ctx.shouldAbort);
      }
    }

    if (variants.length > 1) notes.push('вікно покриття пропущено (union кількох видач)');

    return finalizeScanResult({
      searchId,
      runId: ctx.runId,
      search,
      raw: [...merged.values()],
      rawTotal,
      requestsUsed,
      usedGraphql,
      exhausted: allExhausted,
      partial,
      bucketsUsed,
      aborted,
      visibleTotalCount,
      notes,
      missThreshold: 1, // план завжди походить від глибокого скану
    });
  });
}
