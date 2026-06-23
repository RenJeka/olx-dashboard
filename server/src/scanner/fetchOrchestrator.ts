import { GraphqlOlxFetcher } from '../scraper/graphql/index.js';
import { HtmlOlxFetcher } from '../scraper/olxFetcher.js';
import { interruptibleSleep, randomDelayMs } from '../scraper/utils.js';
import {
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
} from '../scraper/constants.js';
import type {
  SearchConfig,
  RawListing,
  FetchOptions,
  ScanProgress,
} from '../types.js';
import { dedupeQueries } from './searchLoader.js';

export const graphqlFetcher = new GraphqlOlxFetcher();
export const htmlFetcher = new HtmlOlxFetcher();

/**
 * Викликає GraphqlOlxFetcher; якщо він кидає помилку — fallback на HtmlOlxFetcher.
 * Якщо впав і fallback — кидає об'єднану помилку (обидва методи недоступні).
 */
export async function fetchWithFallback(
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
export async function fetchAllQueries(
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
