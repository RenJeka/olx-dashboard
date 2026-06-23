import { randomUUID } from 'node:crypto';
import { db } from './db/db.js';
import { GraphqlOlxFetcher } from './scraper/graphql/index.js';
import { estimatePages } from './scraper/graphql/fetcher.js';
import { MAX_PAGES } from './scraper/graphql/constants.js';
import type { SplitPlan } from './scraper/graphql/types.js';
import { HtmlOlxFetcher } from './scraper/olxFetcher.js';
import { upsertListings, selectKnownOlxIds } from './scraper/normalizer.js';
import { applyScanStatuses } from './scraper/statusEngine.js';
import { probeListingPage } from './scraper/verifier.js';
import { fetchCategoryOptions } from './scraper/olxCategories.js';
import { interruptibleSleep, randomDelayMs } from './scraper/utils.js';
import {
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  DEEP_SCAN_SECONDS_PER_REQUEST,
} from './scraper/constants.js';
import type {
  SearchConfig,
  ScanResult,
  ApiFilters,
  RawListing,
  FetchOptions,
  ScanProgress,
  VerifyResult,
  ScanPlan,
  ScanPlanQuery,
  PriceBucketSummary,
} from './types.js';

const graphqlFetcher = new GraphqlOlxFetcher();
const htmlFetcher = new HtmlOlxFetcher();

// ── Зупинка скану (docs/plans/deep-scan-stop-and-history.md) ──────────────────
// Single-user локальний застосунок: один активний скан на пошук. Прапорець ставить
// requestStopScan (роут POST /scan/stop), фетчери опитують його через FetchOptions.shouldAbort.
// При зупинці зібране все одно зберігається (upsert), вікно покриття пропускається.
const abortFlags = new Map<number, boolean>();

/** Запит на зупинку активного скану пошуку. Повертає true, якщо скан справді виконувався. */
export function requestStopScan(searchId: number): boolean {
  if (!abortFlags.has(searchId)) return false;
  abortFlags.set(searchId, true);
  return true;
}

/** Сторінок за один verify-прохід (P1+P2 разом) — той самий порядок, що DEEP_SAFETY_CAP. */
const VERIFY_PAGE_CAP = 50;
/** Розмір батчу — як у фетчерах (graphql/fetcher.ts, olxFetcher.ts). */
const VERIFY_BATCH_SIZE = 3;

interface SearchRow {
  id: number;
  name: string;
  query: string;
  category_id: number | null;
  api_filters: string;
  query_synonyms: string;
}

function loadSearch(id: number): SearchConfig | null {
  const row = db
    .prepare('SELECT id, name, query, category_id, api_filters, query_synonyms FROM searches WHERE id = ?')
    .get(id) as SearchRow | undefined;

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
function dedupeQueries(queries: string[]): string[] {
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
  /** Частковий результат (warning фетчера, напр. «window cap hit») — покриття неповне. */
  partial: boolean;
  /** Кількість цінових бакетів split-скану (>1 — було розбиття); undefined для не-deep/HTML. */
  bucketsUsed?: number;
  /** Сирих оголошень до cross-variant дедупу (для прозорості «злито дублів»). */
  rawCount: number;
  /** Скан перервано через FetchOptions.shouldAbort (кнопка «Зупинити»). */
  aborted: boolean;
}> {
  try {
    // Глибокий скан — оркестратор із авто-розбиттям по ціні (docs/plans/price-range-split.md);
    // звичайний — один прохід. HTML-fallback не розбивається (немає visible_total_count).
    const onGraphqlProgress: FetchOptions['onProgress'] | undefined = options?.onProgress
      ? (p: ScanProgress) => options.onProgress!({ ...p, method: p.method ?? 'GraphQL' })
      : undefined;
    const result = options?.deep
      ? await graphqlFetcher.fetchSearchSplit(search, { ...options, onProgress: onGraphqlProgress })
      : await graphqlFetcher.fetchSearch(search, { ...options, onProgress: onGraphqlProgress });
    return {
      raw: result.listings,
      visibleTotalCount: result.visibleTotalCount,
      note: result.warning ?? null,
      requestsUsed: result.requestsUsed,
      exhausted: result.exhausted,
      usedGraphql: true,
      partial: result.warning != null,
      bucketsUsed: result.bucketsUsed,
      rawCount: result.listings.length,
      aborted: result.aborted ?? false,
    };
  } catch (graphqlErr) {
    const graphqlMessage =
      graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);

    try {
      const result = await htmlFetcher.fetchSearch(search, {
        ...options,
        onProgress: options?.onProgress
          ? (p: ScanProgress) => options.onProgress!({ ...p, method: 'HTML' })
          : undefined,
      });
      const notes = [`graphql failed: ${graphqlMessage}; fallback html OK`];
      if (result.warning) notes.push(result.warning);
      return {
        raw: result.listings,
        visibleTotalCount: result.visibleTotalCount,
        note: notes.join('; '),
        requestsUsed: result.requestsUsed,
        exhausted: result.exhausted,
        usedGraphql: false,
        partial: result.warning != null,
        rawCount: result.listings.length,
        aborted: result.aborted ?? false,
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
 * Сканує основний query + усі синоніми (docs/plans/search-synonyms.md), зливає видачі по
 * olxId. 1 query (без синонімів) — без змін поведінки, делегує fetchWithFallback напряму.
 * >1 query — завжди partial=true: union кількох незалежних видач не відсортований глобально
 * за last_refresh, тож вікно покриття statusEngine (CLAUDE.md) застосовувати небезпечно —
 * той самий принцип, що й у split-скані (graphqlOlxFetcher.fetchSearchSplit).
 */
async function fetchAllQueries(
  search: SearchConfig,
  options?: FetchOptions,
): ReturnType<typeof fetchWithFallback> {
  const variants = dedupeQueries([search.query, ...(search.querySynonyms ?? [])]);

  if (variants.length <= 1) {
    return fetchWithFallback(search, options);
  }

  const merged = new Map<number, RawListing>();
  let requestsUsed = 0;
  let usedGraphql = true;
  let allExhausted = true;
  let bucketsUsed = 0;
  let rawTotal = 0;
  let aborted = false;
  const notes: string[] = [`multi-query: ${variants.length} варіантів запиту змерджено`];

  // Прогрес — кумулятивний офсет (точний total невідомий до завершення всіх варіантів).
  // `maxTotal` тримаємо монотонно-незменшуваним і завжди ≥ `done`, щоб праве число лічильника
  // не стрибало вниз і не опускалося нижче лівого, коли черговий варіант дрібний або фаза
  // бісекції не дає `total` (інакше — баг «103/3», docs/plans/scan-progress-detail.md).
  let doneOffset = 0;
  let totalOffset = 0;
  let maxTotal = 0;

  for (let vi = 0; vi < variants.length; vi++) {
    const variant = variants[vi] as string;
    const variantSearch: SearchConfig = { ...search, query: variant };
    const onVariantProgress: FetchOptions['onProgress'] | undefined = options?.onProgress
      ? (p: ScanProgress) => {
          const done = doneOffset + p.done;
          const candidate = p.total != null ? totalOffset + p.total : 0;
          maxTotal = Math.max(maxTotal, candidate, done);
          options.onProgress!({
            done,
            // maxTotal=0 на старті (фаза зондування, ще немає реального total) НЕ пишемо як 0:
            // інакше requests_total=0 → 0/0=NaN у прогрес-барі фронту (Uncaught Zag error, що
            // зависав сторінку). undefined → COALESCE лишає NULL → UI показує «Підготовка…».
            total: maxTotal > 0 ? maxTotal : undefined,
            method: p.method,
            stage: `Синонім «${variant}» (${vi + 1}/${variants.length})${p.stage ? ` · ${p.stage}` : ''}`,
            subDone: vi + 1,
            subTotal: variants.length,
          });
        }
      : undefined;

    const result = await fetchWithFallback(variantSearch, { ...options, onProgress: onVariantProgress });

    for (const item of result.raw) merged.set(item.olxId, item);
    requestsUsed += result.requestsUsed;
    rawTotal += result.rawCount;
    if (!result.usedGraphql) usedGraphql = false;
    if (!result.exhausted) allExhausted = false;
    if (result.bucketsUsed) bucketsUsed += result.bucketsUsed;
    if (result.note) notes.push(`«${variant}»: ${result.note}`);

    doneOffset += result.requestsUsed;
    totalOffset += Math.max(result.requestsUsed, 1);

    // Зупинено користувачем — решту синонімів не скануємо, повертаємо вже зібране.
    if (result.aborted) {
      aborted = true;
      break;
    }

    // Ввічливість між варіантами синонімів — як пауза між батчами глибокого скану.
    if (vi < variants.length - 1) {
      const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
      options?.onProgress?.({
        done: doneOffset,
        stage: `Пауза між синонімами ~${Math.round(delay / 1000)}с`,
        subDone: vi + 1,
        subTotal: variants.length,
      });
      await interruptibleSleep(delay, options?.shouldAbort);
    }
  }

  notes.push('вікно покриття пропущено (union кількох видач)');

  return {
    raw: [...merged.values()],
    // Об'єднана видача кількох незалежних запитів — visible_total_count окремого
    // запиту тут не репрезентативний (перетин/розбіжність неконтрольована).
    visibleTotalCount: null,
    note: notes.join('; '),
    requestsUsed,
    exhausted: allExhausted,
    usedGraphql,
    partial: true,
    bucketsUsed: bucketsUsed > 0 ? bucketsUsed : undefined,
    rawCount: rawTotal,
    aborted,
  };
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
/**
 * Best-effort оновлення дерева категорій OLX (facet) для пошуку після успішного скану.
 * Один легкий запит до OLX; результат кешується у searches.category_facet (фільтр категорій
 * читає його без мережі). Помилка/недоступність → лишаємо попереднє дерево, скан не валимо.
 * Тягнемо лише для основного `query` (синоніми дали б непорівнянні OLX-числа через перетин видач).
 */
async function refreshCategoryFacet(searchId: number, query: string): Promise<void> {
  try {
    const categories = await fetchCategoryOptions(query);
    if (categories) {
      db.prepare('UPDATE searches SET category_facet = ? WHERE id = ?').run(
        JSON.stringify(categories),
        searchId,
      );
    }
  } catch {
    // best-effort — дерево категорій не критичне для скану
  }
}

export async function runScan(searchId: number, options?: { deep?: boolean }): Promise<ScanResult> {
  const search = loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  const kind = options?.deep ? 'deep' : 'normal';

  abortFlags.set(searchId, false);
  const shouldAbort = (): boolean => abortFlags.get(searchId) === true;

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)')
      .run(searchId, new Date().toISOString(), kind).lastInsertRowid,
  );

  // `stage` перезаписується завжди (транзієнтний текст, у т.ч. під час пауз). Решта — через
  // COALESCE, щоб транзієнтні оновлення (напр. лише stage під час паузи) не затирали
  // requests_total/fetch_method/sub_done/sub_total попереднім NULL (docs/plans/scan-progress-detail.md).
  const onProgress = (p: ScanProgress): void => {
    db.prepare(
      `UPDATE scan_runs SET
         requests_done = ?,
         requests_total = COALESCE(?, requests_total),
         fetch_method = COALESCE(?, fetch_method),
         stage = ?,
         sub_done = COALESCE(?, sub_done),
         sub_total = COALESCE(?, sub_total)
       WHERE id = ?`,
    ).run(
      p.done,
      p.total ?? null,
      p.method ?? null,
      p.stage ?? null,
      p.subDone ?? null,
      p.subTotal ?? null,
      runId,
    );
  };

  try {
    const { raw, visibleTotalCount, note, requestsUsed, exhausted, usedGraphql, partial, bucketsUsed, rawCount, aborted } =
      await fetchAllQueries(search, {
        deep: options?.deep,
        onProgress,
        shouldAbort,
      });
    const upsertResult = upsertListings(searchId, raw);

    // Зупинка користувачем — зібране вже збережено вище, але покриття неповне:
    // forced partial (вікно покриття пропускається), окрема нота, scan позначається stopped.
    const stopped = aborted;
    const effectivePartial = partial || stopped;

    // Вікно покриття (CLAUDE.md): лише для ПОВНИХ успішних GraphQL-сканів — не fallback,
    // не часткових (частковий deep із «window cap hit»/зупинка) і НЕ split (union кількох
    // діапазонів не відсортований глобально за refresh — вісь windowFloor невалідна). Усі
    // ці випадки ставлять warning → partial=true → coverage пропускається.
    // Поріг disable пропорційний надійності скану: глибокий бачить усю видачу → 1 промах;
    // звичайний (верхівка) → 2 (docs/plans/honest-olx-status.md).
    const { disabled_count } = usedGraphql && !effectivePartial
      ? applyScanStatuses(searchId, raw, exhausted, options?.deep ? 1 : 2)
      : { disabled_count: 0 };

    const result: ScanResult = {
      ...upsertResult,
      rawFound: rawCount,
      requestsUsed,
      disabled_count,
      bucketsUsed,
      stopped,
    };

    if (visibleTotalCount != null) {
      db.prepare('UPDATE searches SET visible_total_count = ? WHERE id = ?').run(
        visibleTotalCount,
        searchId,
      );
    }

    // Дерево категорій OLX (facet) — оновлюємо лише після успішного GraphQL-скану.
    if (usedGraphql && !stopped) await refreshCategoryFacet(searchId, search.query);

    const finalNote = stopped
      ? [`Зупинено користувачем — збережено ${result.found} оголошень`, note].filter(Boolean).join('; ')
      : note;

    // Скан вдався: `note` — це попередження часткового успіху (multi-query/split/HTML-fallback/
    // зупинка), НЕ помилка → колонка `warning`, `error` лишається NULL (UI показує amber
    // «Попередження», а не червону «Помилку»).
    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, raw_found = ?, disabled_count = ?, warning = ?, error = NULL,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(
      new Date().toISOString(),
      result.found,
      result.new_count,
      result.rawFound,
      result.disabled_count,
      finalNote,
      runId,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, error = ?,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(new Date().toISOString(), message, runId);
    throw err;
  } finally {
    abortFlags.delete(searchId);
  }
}

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
  const search = loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  cleanupExpiredPlans();

  abortFlags.set(searchId, false);
  const shouldAbort = (): boolean => abortFlags.get(searchId) === true;

  const variants = dedupeQueries([search.query, ...(search.querySynonyms ?? [])]);

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)')
      .run(searchId, new Date().toISOString(), 'analyze').lastInsertRowid,
  );

  const onProgress = (p: ScanProgress): void => {
    db.prepare(
      `UPDATE scan_runs SET
         requests_done = ?,
         requests_total = COALESCE(?, requests_total),
         stage = ?,
         sub_done = COALESCE(?, sub_done),
         sub_total = COALESCE(?, sub_total)
       WHERE id = ?`,
    ).run(p.done, p.total ?? null, p.stage ?? null, p.subDone ?? null, p.subTotal ?? null, runId);
  };

  try {
    const perQuery: ScanPlanQuery[] = [];
    const plans: { query: string; plan: SplitPlan }[] = [];
    let requestsUsed = 0;
    let totalListings = 0;
    let totalBuckets = 0;
    let remainingRequests = 0;
    let knownSampleCount = 0;
    let sampleTotal = 0;
    let hasSample = false;
    // Глобальний дедуп вибірки між варіантами: оцінити частку унікальних після злиття синонімів.
    const globalSampleIds = new Set<number>();
    let sumSampleSize = 0;
    const warnings: string[] = [];

    for (let vi = 0; vi < variants.length; vi++) {
      if (shouldAbort()) {
        throw new Error('Аналіз зупинено користувачем');
      }
      const variant = variants[vi] as string;
      const variantSearch: SearchConfig = { ...search, query: variant };
      const onVariantProgress: FetchOptions['onProgress'] = (p) =>
        onProgress({
          done: requestsUsed + p.done,
          stage: `Аналіз «${variant}» (${vi + 1}/${variants.length})${p.stage ? ` · ${p.stage}` : ''}`,
          subDone: vi + 1,
          subTotal: variants.length,
        });

      let plan: SplitPlan;
      try {
        plan = await graphqlFetcher.analyzeSplit(variantSearch, { onProgress: onVariantProgress, shouldAbort });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`«${variant}»: аналіз GraphQL не вдався (${message}) — повний скан спробує ще раз і перейде на HTML, якщо потрібно`);
        plan = {
          rootCount: null,
          buckets: [],
          rootItems: [],
          requestsUsed: 0,
          noSplit: true,
          fallbackReason: `graphql analyze failed: ${message}`,
        };
      }
      plans.push({ query: variant, plan });
      requestsUsed += plan.requestsUsed;

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
      if (sampleItems.length > 0) {
        sampleUnique = 0;
        for (const it of sampleItems) {
          if (!globalSampleIds.has(it.olxId)) {
            globalSampleIds.add(it.olxId);
            sampleUnique++;
          }
        }
        hasSample = true;
        const known = selectKnownOlxIds(sampleItems.map((it) => it.olxId));
        knownSampleCount += known.size;
        sampleTotal += sampleItems.length;
        sumSampleSize += sampleItems.length;
      }

      perQuery.push({
        query: variant,
        rootCount: plan.rootCount,
        buckets: bucketSummaries,
        noSplit: plan.noSplit,
        fallbackReason: plan.fallbackReason,
        remainingRequests: variantRemaining,
        sampleUnique,
      });

      if (plan.rootCount != null) totalListings += plan.rootCount;
      totalBuckets += plan.buckets.length;
      remainingRequests += variantRemaining;

      if (vi < variants.length - 1) {
        const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
        onProgress({
          done: requestsUsed,
          stage: `Пауза між варіантами ~${Math.round(delay / 1000)}с`,
          subDone: vi + 1,
          subTotal: variants.length,
        });
        await interruptibleSleep(delay, shouldAbort);
      }
    }

    // Зупинка під час бісекції ОСТАННЬОГО варіанта: bisectPriceRange виходить тихо й повертає
    // обрізані бакети, а перевірки на початку наступної ітерації вже не буде — без цієї пост-
    // циклової перевірки обрізаний план зберігся б як завершений аналіз (GET /last-analysis
    // віддав би його запускним). Кидаємо як інші зупинки → catch запише error, план НЕ зберігає.
    if (shouldAbort()) {
      throw new Error('Аналіз зупинено користувачем');
    }

    // Невідфільтрований тотал головного query — щоб звіт показав «N у вашому фільтрі ціни / ~M
    // всього на OLX» і не виникало хибного відчуття недозбору при порівнянні з сайтом. Один
    // додатковий запит, лише коли фільтр ціни активний (інакше числа й так невідфільтровані).
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

    const estimatedNew = hasSample && sampleTotal > 0
      ? Math.round(((sampleTotal - knownSampleCount) / sampleTotal) * totalListings)
      : null;

    // Оцінка унікальних після дедупу між синонімами: частка унікальних у вибірці × сума.
    const estimatedUnique = hasSample && sumSampleSize > 0
      ? Math.round((globalSampleIds.size / sumSampleSize) * totalListings)
      : null;

    // Калібрування реальними даними: останній завершений нормальний скан (не аналітичний).
    const lastScan = db
      .prepare(
        `SELECT raw_found, found FROM scan_runs
         WHERE search_id = ? AND kind != 'analyze' AND finished_at IS NOT NULL AND found IS NOT NULL
         ORDER BY finished_at DESC LIMIT 1`,
      )
      .get(searchId) as { raw_found: number | null; found: number | null } | undefined;

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
    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, found = 0, new_count = 0, warning = ?, scan_plan = ?, error = NULL,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(
      new Date().toISOString(),
      warnings.length > 0 ? warnings.join('; ') : null,
      JSON.stringify(scanPlan),
      runId,
    );

    return scanPlan;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, error = ?,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(new Date().toISOString(), message, runId);
    throw err;
  } finally {
    abortFlags.delete(searchId);
  }
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
 * `olxId`, далі стандартний хвіст `runScan` (upsert, `applyScanStatuses` лише для повного
 * успішного single-query GraphQL, оновлення `visible_total_count`, фіналізація `scan_runs` з
 * `kind='deep'`). GraphQL-збій під час самого допагінування — fallback на HTML (як `fetchWithFallback`).
 *
 * Якщо швидкого in-memory плану під токеном уже немає (TTL-edge, перезапуск сервера або повторний
 * запуск), але аналіз ще «свіжий» за часом (`isAnalysisFresh`) — НЕ змушуємо повторювати аналіз
 * вручну: робимо повний глибокий скан із повторним зондуванням (`runScan deep`). Результат той
 * самий, лише дорожче на probe-запити. Тільки коли аналіз справді протермінований (> TTL) —
 * зрозуміла помилка «повторіть аналіз».
 */
export async function runDeepScanFromPlan(searchId: number, planToken: string): Promise<ScanResult> {
  cleanupExpiredPlans();
  const cached = planCache.get(planToken);
  if (!cached || cached.searchId !== searchId) {
    const lastAnalyze = db
      .prepare(
        `SELECT finished_at FROM scan_runs
         WHERE search_id = ? AND kind = 'analyze' AND scan_plan IS NOT NULL
         ORDER BY id DESC LIMIT 1`,
      )
      .get(searchId) as { finished_at: string | null } | undefined;
    if (lastAnalyze && isAnalysisFresh(lastAnalyze.finished_at)) {
      // Аналіз ще в межах TTL — перезондуємо повним глибоким сканом (стійко до втрати кешу).
      return runScan(searchId, { deep: true });
    }
    throw new Error('План застарів або не знайдено — повторіть аналіз');
  }
  planCache.delete(planToken); // швидкий план одноразовий; у межах TTL повторний запуск перезондує (вище)

  const search = loadSearch(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  abortFlags.set(searchId, false);
  const shouldAbort = (): boolean => abortFlags.get(searchId) === true;

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)')
      .run(searchId, new Date().toISOString(), 'deep').lastInsertRowid,
  );

  const onProgress = (p: ScanProgress): void => {
    db.prepare(
      `UPDATE scan_runs SET
         requests_done = ?,
         requests_total = COALESCE(?, requests_total),
         fetch_method = COALESCE(?, fetch_method),
         stage = ?,
         sub_done = COALESCE(?, sub_done),
         sub_total = COALESCE(?, sub_total)
       WHERE id = ?`,
    ).run(
      p.done,
      p.total ?? null,
      p.method ?? null,
      p.stage ?? null,
      p.subDone ?? null,
      p.subTotal ?? null,
      runId,
    );
  };

  try {
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
    // `requests_total` не стрибав униз між варіантами (bug «103/3»). У `onVariantProgress`
    // клампимо так, щоб total ніколи не був меншим за поточний `done`.
    const plannedTotal = variants.reduce((sum, e) => sum + estimateRunRequests(e.plan), 0);
    onProgress({
      done: 0,
      total: plannedTotal,
      subTotal: variants.length,
      stage: 'Підготовка…',
    });

    for (let vi = 0; vi < variants.length; vi++) {
      if (shouldAbort()) {
        aborted = true;
        break;
      }
      const entry = variants[vi] as { query: string; plan: SplitPlan };
      const variant = entry.query;
      const variantSearch: SearchConfig = { ...search, query: variant };
      const onVariantProgress: FetchOptions['onProgress'] = (p) => {
        const done = requestsUsed + p.done;
        onProgress({
          done,
          // Стабільний наперед-порахований total; ніколи не нижче за поточний `done`
          // (захист від розбіжності оцінки split vs noSplit) — bug «103/3».
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
          shouldAbort,
        });
        raw = splitResult.listings;
        result = splitResult;
      } catch (graphqlErr) {
        const graphqlMessage = graphqlErr instanceof Error ? graphqlErr.message : String(graphqlErr);
        const htmlResult = await htmlFetcher.fetchSearch(variantSearch, {
          onProgress: (p) => onVariantProgress({ ...p, method: 'HTML' }),
          shouldAbort,
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

      // Зупинено користувачем — решту варіантів не скануємо, повертаємо вже зібране.
      if (result.aborted) {
        aborted = true;
        break;
      }

      if (vi < variants.length - 1) {
        const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
        onProgress({
          done: requestsUsed,
          stage: `Пауза між синонімами ~${Math.round(delay / 1000)}с`,
          subDone: vi + 1,
          subTotal: variants.length,
        });
        await interruptibleSleep(delay, shouldAbort);
      }
    }

    if (variants.length > 1) notes.push('вікно покриття пропущено (union кількох видач)');

    const raw = [...merged.values()];
    const upsertResult = upsertListings(searchId, raw);

    const stopped = aborted;
    const effectivePartial = partial || stopped;

    const { disabled_count } = usedGraphql && !effectivePartial
      ? applyScanStatuses(searchId, raw, allExhausted, 1) // план завжди походить від глибокого скану
      : { disabled_count: 0 };

    const result: ScanResult = {
      ...upsertResult,
      rawFound: rawTotal,
      requestsUsed,
      disabled_count,
      bucketsUsed,
      stopped,
    };

    if (visibleTotalCount != null) {
      db.prepare('UPDATE searches SET visible_total_count = ? WHERE id = ?').run(
        visibleTotalCount,
        searchId,
      );
    }

    // Дерево категорій OLX (facet) — оновлюємо після успішного глибокого скану з плану.
    if (!stopped) await refreshCategoryFacet(searchId, search.query);

    if (stopped) {
      notes.unshift(`Зупинено користувачем — збережено ${result.found} оголошень`);
    }

    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, raw_found = ?, disabled_count = ?, warning = ?, error = NULL,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(
      new Date().toISOString(),
      result.found,
      result.new_count,
      result.rawFound,
      result.disabled_count,
      notes.length > 0 ? notes.join('; ') : null,
      runId,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, error = ?,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(new Date().toISOString(), message, runId);
    throw err;
  } finally {
    abortFlags.delete(searchId);
  }
}

interface VerifyCandidateRow {
  id: number;
  olx_id: number;
  url: string;
  status: string;
  status_source: string;
  note: string;
  description: string | null;
  seller_name: string | null;
}

// P1 (живість): давно не бачені auto-рядки або manual-rejected — включно зі status='disabled'
// (auto), щоб дати шанс на реактивацію. ORDER BY last_seen_at ASC — найдавніші спершу.
const P1_CONDITION = `
  url IS NOT NULL
  AND last_seen_at < datetime('now', '-3 days')
  AND (status_source = 'auto' OR status = 'rejected')
`;

// P2 (дозаповнення): рядки без опису, що ще активні — не в P1 (NOT (P1_CONDITION)).
// ORDER BY posted_at DESC — свіжі цінніші.
const P2_CONDITION = `
  url IS NOT NULL
  AND description IS NULL
  AND status != 'disabled'
  AND NOT (${P1_CONDITION})
`;

/**
 * Кандидати verify-проходу (≤ cap, P1 спершу). Реалізація — `docs/plans/verify-pass.md` групи B1.
 * `p1Count` — межа фаз (P1 живість / P2 дозаповнення) для прогресу (docs/plans/scan-progress-detail.md).
 */
function loadVerifyCandidates(
  searchId: number,
  cap: number,
): { candidates: VerifyCandidateRow[]; p1Count: number } {
  const columns = 'id, olx_id, url, status, status_source, note, description, seller_name';

  const p1 = db
    .prepare(
      `SELECT ${columns} FROM listings WHERE search_id = ? AND ${P1_CONDITION} ORDER BY last_seen_at ASC LIMIT ?`,
    )
    .all(searchId, cap) as VerifyCandidateRow[];

  if (p1.length >= cap) return { candidates: p1, p1Count: p1.length };

  const p2 = db
    .prepare(
      `SELECT ${columns} FROM listings WHERE search_id = ? AND ${P2_CONDITION} ORDER BY posted_at DESC LIMIT ?`,
    )
    .all(searchId, cap - p1.length) as VerifyCandidateRow[];

  return { candidates: [...p1, ...p2], p1Count: p1.length };
}

/** Загальна кількість кандидатів verify-проходу (P1+P2, без перетину) — для /stats. */
export function countVerifyCandidates(searchId: number): number {
  const { cnt: p1 } = db
    .prepare(`SELECT COUNT(*) AS cnt FROM listings WHERE search_id = ? AND ${P1_CONDITION}`)
    .get(searchId) as { cnt: number };

  const { cnt: p2 } = db
    .prepare(`SELECT COUNT(*) AS cnt FROM listings WHERE search_id = ? AND ${P2_CONDITION}`)
    .get(searchId) as { cnt: number };

  return p1 + p2;
}

/** Дописує marker у note, якщо його ще немає (ідемпотентність — патерн normalizer.ts). */
function appendVerifyNote(note: string, marker: string): string {
  if (note.includes(marker)) return note;
  return note === '' ? marker : `${note}\n${marker}`;
}

// dead → olx_status='removed' (підтверджено прямою пробою 410/404 — точніше за coverage 'inactive').
const updateDeadStmt = db.prepare(
  `UPDATE listings SET status = 'disabled', note = ?, olx_status = 'removed' WHERE id = ?`,
);

// alive: при реактивації (disabled→new) сторінка живою підтверджена (200+опис) → olx_status='active';
// без реактивації olx_status не чіпаємо (probe — HTML, сирого статусу OLX не дає).
const updateAliveStmt = db.prepare(`
  UPDATE listings SET
    last_seen_at = datetime('now'),
    miss_count = 0,
    status = @status,
    olx_status = CASE WHEN @reactivate = 1 THEN 'active' ELSE olx_status END,
    description = COALESCE(description, @description),
    seller_name = COALESCE(seller_name, @seller_name)
  WHERE id = @id
`);

/**
 * Verify-прохід (Етап 2 A3, `docs/plans/verify-pass.md`): пряма перевірка сторінок
 * оголошень — живість (P1, давно не бачені) + дозаповнення description/seller_name
 * для рядків за межами вікна пагінації GraphQL (P2). До VERIFY_PAGE_CAP сторінок,
 * батчі по VERIFY_BATCH_SIZE з паузами (як глибокий скан). Прогрес — через
 * scan_runs.requests_done/requests_total (поллінг GET /scan-status).
 *
 * Маркери (docs/olx-api.md §3.4, верифіковано live 2026-06-12): 404|410 → dead;
 * 200 + `ad_description` → alive; інше → unknown (статус не змінюється).
 */
export async function runVerify(searchId: number): Promise<VerifyResult> {
  const search = db.prepare('SELECT id FROM searches WHERE id = ?').get(searchId);
  if (!search) {
    throw new Error(`Search ${searchId} не знайдено`);
  }

  abortFlags.set(searchId, false);
  const shouldAbort = (): boolean => abortFlags.get(searchId) === true;

  const runId = Number(
    db
      .prepare('INSERT INTO scan_runs (search_id, started_at, kind) VALUES (?, ?, ?)')
      .run(searchId, new Date().toISOString(), 'verify').lastInsertRowid,
  );

  const { candidates, p1Count } = loadVerifyCandidates(searchId, VERIFY_PAGE_CAP);
  const total = candidates.length;
  const p2Count = total - p1Count;
  // Сегментована смуга прогресу має сенс лише коли ОБИДВІ фази мають кандидатів — інакше
  // прохід однофазний і sub_total лишаємо NULL (docs/plans/scan-progress-detail.md).
  const hasTwoPhases = p1Count > 0 && p2Count > 0;
  db.prepare('UPDATE scan_runs SET requests_done = 0, requests_total = ? WHERE id = ?').run(
    total,
    runId,
  );

  const result: VerifyResult = {
    checked: 0,
    alive: 0,
    dead: 0,
    unknown: 0,
    reactivated: 0,
    disabled_count: 0,
    backfilled: 0,
  };
  const unknownIssues: string[] = [];
  let aborted = false;

  try {
    for (let i = 0; i < candidates.length; i++) {
      if (shouldAbort()) {
        aborted = true;
        break;
      }
      const candidate = candidates[i] as VerifyCandidateRow;
      const probe = await probeListingPage(candidate.url);
      result.checked++;

      if (probe.verdict === 'dead') {
        result.dead++;
        if (candidate.status_source === 'auto' || candidate.status === 'rejected') {
          const marker = `auto-disabled: verify http=${probe.httpStatus}`;
          updateDeadStmt.run(appendVerifyNote(candidate.note, marker), candidate.id);
          result.disabled_count++;
        }
      } else if (probe.verdict === 'alive') {
        result.alive++;
        const reactivate = candidate.status === 'disabled' && candidate.status_source === 'auto';
        if (reactivate) result.reactivated++;

        const backfillsDescription = candidate.description == null && probe.description != null;
        const backfillsSeller = candidate.seller_name == null && probe.sellerName != null;
        if (backfillsDescription || backfillsSeller) result.backfilled++;

        updateAliveStmt.run({
          id: candidate.id,
          status: reactivate ? 'new' : candidate.status,
          reactivate: reactivate ? 1 : 0,
          description: probe.description,
          seller_name: probe.sellerName,
        });
      } else {
        result.unknown++;
        unknownIssues.push(
          `#${candidate.olx_id}: ${probe.httpStatus == null ? 'мережева помилка' : `http=${probe.httpStatus}`}`,
        );
      }

      const phase = i < p1Count ? 'Перевірка живості' : 'Перевірка опису';
      const stage = `${phase} · #${candidate.olx_id} · живих ${result.alive} · мертвих ${result.dead}`;
      db.prepare(
        `UPDATE scan_runs SET requests_done = ?, stage = ?, sub_done = ?, sub_total = ? WHERE id = ?`,
      ).run(
        i + 1,
        stage,
        hasTwoPhases ? (i < p1Count ? 1 : 2) : null,
        hasTwoPhases ? 2 : null,
        runId,
      );

      if (i < candidates.length - 1) {
        if ((i + 1) % VERIFY_BATCH_SIZE === 0) {
          await interruptibleSleep(randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS), shouldAbort);
        } else {
          await interruptibleSleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS), shouldAbort);
        }
      }
    }

    const error = unknownIssues.length > 0 ? `verify unknown: ${unknownIssues.join('; ')}` : null;
    const warning = aborted ? `Зупинено користувачем — перевірено ${result.checked} з ${total}` : null;

    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, found = ?, new_count = ?, disabled_count = ?, error = ?, warning = ?,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(
      new Date().toISOString(),
      result.checked,
      result.reactivated,
      result.disabled_count,
      error,
      warning,
      runId,
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE scan_runs SET finished_at = ?, error = ?,
         stage = NULL, sub_done = NULL, sub_total = NULL WHERE id = ?`,
    ).run(new Date().toISOString(), message, runId);
    throw err;
  } finally {
    abortFlags.delete(searchId);
  }
}
