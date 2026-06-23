import type { SearchConfig, RawListing, FetchOptions } from '../../types.js';
import { interruptibleSleep, randomDelayMs } from '../utils.js';
import {
  BATCH_SIZE,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
} from '../constants.js';
import {
  PAGE_LIMIT,
  MAX_PAGES,
  SPLIT_THRESHOLD,
  MIN_PRICE_WIDTH,
  MAX_BUCKETS,
  MAX_TOTAL_REQUESTS,
  PRICE_SORT_CANDIDATES,
} from './constants.js';
import type { PriceBucket, SplitPlan } from './types.js';
import type { GraphqlClient } from './client.js';

export function estimatePages(count: number): number {
  return Math.min(MAX_PAGES, Math.max(1, Math.ceil(count / PAGE_LIMIT)));
}

/**
 * Містить логіку розбиття великої видачі на менші цінові діапазони (бакети), 
 * щоб обійти ліміт вікна пагінації GraphQL OLX (максимум 1000 результатів).
 * Керує процесами бісекції (зондування цінових меж) та чергою допагінації.
 */
export class SplitScanner {
  constructor(private client: GraphqlClient) {}

  /**
   * Аналітична (probe) фаза split-скану: root-зондування → межі ціни → бісекція на бакети.
   * Жодної допагінації листів — лише видача `SplitPlan`, який `scanFromPlan` довершує без
   * повторних probe-запитів.
   */
  async analyzeSplit(search: SearchConfig, options?: FetchOptions): Promise<SplitPlan> {
    const referer = this.client.buildReferer(search.query);
    const onProgress = options?.onProgress;
    let requestsUsed = 0;

    onProgress?.({ done: 0, stage: 'Зондування видачі' });

    const rootPage = await this.client.fetchPage(search, 0, referer);
    requestsUsed++;
    if (rootPage.listingError) {
      throw new Error(this.client.listingErrorMessage(rootPage.listingError));
    }
    const rootCount = rootPage.visibleTotalCount;

    if (rootCount == null || rootCount <= SPLIT_THRESHOLD) {
      return { rootCount, buckets: [], rootItems: rootPage.items, requestsUsed, noSplit: true };
    }

    const hi = await this.resolveUpperPriceBound(search, requestsUsed, onProgress);
    requestsUsed = hi.requestsUsed;

    if (hi.upperBound == null) {
      return {
        rootCount,
        buckets: [],
        rootItems: rootPage.items,
        requestsUsed,
        noSplit: true,
        fallbackReason: 'no upper price bound',
      };
    }

    const lo = search.apiFilters.ranges?.price?.from ?? 0;

    const bisection = await this.bisectPriceRange(
      search, referer, lo, hi.upperBound, requestsUsed, onProgress, options?.shouldAbort,
    );

    return {
      rootCount,
      buckets: bisection.buckets,
      rootItems: rootPage.items,
      requestsUsed: bisection.requestsUsed,
      noSplit: false,
    };
  }

  /**
   * Довершує збір за вже готовим `SplitPlan` (допагінація листів-бакетів).
   */
  async scanBuckets(
    search: SearchConfig,
    referer: string,
    rootItems: RawListing[],
    buckets: PriceBucket[],
    startRequestsUsed: number,
    onProgress?: FetchOptions['onProgress'],
    shouldAbort?: () => boolean,
  ): Promise<{
    listings: RawListing[];
    requestsUsed: number;
    allExhausted: boolean;
    capHit: boolean;
    aborted: boolean;
  }> {
    let requestsUsed = startRequestsUsed;
    const merged = new Map<number, RawListing>();
    for (const item of rootItems) merged.set(item.olxId, item);

    const remainingEstimate = buckets.reduce(
      (sum, b) => sum + Math.max(0, estimatePages(b.count) - 1),
      0,
    );
    const totalEstimate = requestsUsed + remainingEstimate;

    let allExhausted = true;
    let capHit = false;
    let aborted = false;

    for (let bi = 0; bi < buckets.length; bi++) {
      if (shouldAbort?.()) {
        aborted = true;
        break;
      }
      const bucket = buckets[bi]!;
      for (const item of bucket.page0) merged.set(item.olxId, item);

      if (bucket.count <= PAGE_LIMIT || bucket.page0.length < PAGE_LIMIT) {
        continue;
      }

      const scanResult = await this.scanSingleBucket({
        search,
        referer,
        bucket,
        bucketIndex: bi,
        totalBuckets: buckets.length,
        totalEstimate,
        startRequestsUsed: requestsUsed,
        onProgress,
        shouldAbort,
      });

      for (const item of scanResult.items) merged.set(item.olxId, item);
      requestsUsed = scanResult.requestsUsed;

      if (scanResult.aborted) {
        aborted = true;
        break;
      }
      if (!scanResult.exhausted) allExhausted = false;
      if (scanResult.capHit || requestsUsed >= MAX_TOTAL_REQUESTS) {
        capHit = true;
        break;
      }

      if (bi < buckets.length - 1) {
        await this.pauseBetweenBuckets(requestsUsed, onProgress, shouldAbort);
      }
    }

    return { listings: [...merged.values()], requestsUsed, allExhausted, capHit, aborted };
  }

  /**
   * Зондує максимальну ціну видачі одним запитом із сортуванням за ціною спадно.
   * САМОПЕРЕВІРКА: повертає число лише якщо сторінка дійсно впорядкована за ціною.
   */
  async probeMaxPrice(search: SearchConfig): Promise<number | null> {
    const referer = this.client.buildReferer(search.query);

    for (const sortBy of PRICE_SORT_CANDIDATES) {
      let page;
      try {
        page = await this.client.fetchPage(search, 0, referer, { sortBy, limit: PAGE_LIMIT });
      } catch {
        continue;
      }
      if (page.listingError) continue;

      const prices = page.items
        .map((it) => it.price)
        .filter((p): p is number => p != null);
      if (prices.length < 2) continue;

      const sorted = prices.every((p, idx) => idx === 0 || p <= prices[idx - 1]!);
      if (sorted) return prices[0]!;
    }

    return null;
  }

  /**
   * Визначає верхню межу ціни для split-скану: 
   * бере з `apiFilters.ranges.price.to` або обчислює через зондування `probeMaxPrice`.
   */
  private async resolveUpperPriceBound(
    search: SearchConfig,
    startRequestsUsed: number,
    onProgress?: FetchOptions['onProgress'],
  ): Promise<{ upperBound: number | null; requestsUsed: number }> {
    let requestsUsed = startRequestsUsed;
    const priceRange = search.apiFilters.ranges?.price;
    const explicitTo = priceRange?.to ?? null;

    if (explicitTo != null) {
      return { upperBound: explicitTo, requestsUsed };
    }

    onProgress?.({ done: requestsUsed, stage: 'Зондування максимальної ціни' });
    const maxPrice = await this.probeMaxPrice(search);
    requestsUsed += PRICE_SORT_CANDIDATES.length;

    return { upperBound: maxPrice, requestsUsed };
  }

  /**
   * Фаза бісекції: ділить діапазон [lo, hi] на цінові бакети, 
   * кожен з яких містить `count <= SPLIT_THRESHOLD`.
   * Працює як алгоритм пошуку в ширину (BFS).
   */
  private async bisectPriceRange(
    search: SearchConfig,
    referer: string,
    lo: number,
    hi: number,
    startRequestsUsed: number,
    onProgress?: FetchOptions['onProgress'],
    shouldAbort?: () => boolean,
  ): Promise<{ buckets: PriceBucket[]; requestsUsed: number }> {
    let requestsUsed = startRequestsUsed;
    const buckets: PriceBucket[] = [];
    const queue: Array<{ from: number; to: number }> = [{ from: lo, to: hi }];

    while (queue.length > 0) {
      if (requestsUsed >= MAX_TOTAL_REQUESTS) break;
      if (shouldAbort?.()) break;
      const interval = queue.shift()!;
      const page = await this.client.fetchPage(search, 0, referer, {
        priceRange: { from: interval.from, to: interval.to },
      });
      requestsUsed++;

      const count = page.listingError ? 0 : page.visibleTotalCount ?? 0;
      const width = interval.to - interval.from;
      const isLeaf =
        page.listingError != null ||
        count <= SPLIT_THRESHOLD ||
        width < MIN_PRICE_WIDTH ||
        buckets.length + queue.length + 1 >= MAX_BUCKETS;

      if (isLeaf) {
        buckets.push({ from: interval.from, to: interval.to, count, page0: page.items });
        onProgress?.({
          done: requestsUsed,
          stage: `Розбиття діапазону (знайдено ${buckets.length})`,
        });
      } else {
        const mid = Math.floor((interval.from + interval.to) / 2);
        queue.push({ from: interval.from, to: mid });
        queue.push({ from: mid + 1, to: interval.to });
      }
    }

    return { buckets, requestsUsed };
  }

  /**
   * Пагінація одного конкретного цінового бакету: збирає листи, починаючи з offset=PAGE_LIMIT
   * (оскільки offset=0 вже був зібраний під час probe-фази/бісекції).
   */
  private async scanSingleBucket(opts: {
    search: SearchConfig;
    referer: string;
    bucket: PriceBucket;
    bucketIndex: number;
    totalBuckets: number;
    totalEstimate: number;
    startRequestsUsed: number;
    onProgress?: FetchOptions['onProgress'];
    shouldAbort?: () => boolean;
  }) {
    let requestsUsed = opts.startRequestsUsed;
    const items: RawListing[] = [];
    const pages = estimatePages(opts.bucket.count);
    let bucketExhausted = false;
    let capHit = false;
    let aborted = false;

    for (let p = 1; p < pages; p++) {
      if (requestsUsed >= MAX_TOTAL_REQUESTS) {
        capHit = true;
        break;
      }
      if (opts.shouldAbort?.()) {
        aborted = true;
        break;
      }
      const offset = p * PAGE_LIMIT;
      const page = await this.client.fetchPage(opts.search, offset, opts.referer, {
        priceRange: { from: opts.bucket.from, to: opts.bucket.to },
      });
      requestsUsed++;
      opts.onProgress?.({
        done: requestsUsed,
        total: opts.totalEstimate,
        method: 'GraphQL',
        stage: `Бакет ₴${opts.bucket.from}–${opts.bucket.to} · стор. ${p}/${pages}`,
        subDone: opts.bucketIndex + 1,
        subTotal: opts.totalBuckets,
      });

      if (page.listingError) {
        capHit = true;
        break;
      }

      items.push(...page.items);

      if (page.items.length < PAGE_LIMIT) {
        bucketExhausted = true;
        break;
      }

      await this.applySmartPause(requestsUsed, true, opts.onProgress, opts.shouldAbort);
    }

    return { items, requestsUsed, exhausted: bucketExhausted, capHit, aborted };
  }

  private async applySmartPause(
    requestsUsed: number,
    isDeep: boolean,
    onProgress?: FetchOptions['onProgress'],
    shouldAbort?: () => boolean,
  ) {
    if (isDeep && requestsUsed % BATCH_SIZE === 0) {
      const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
      onProgress?.({ done: requestsUsed, stage: `Пауза ~${Math.round(delay / 1000)}с` });
      await interruptibleSleep(delay, shouldAbort);
    } else {
      await interruptibleSleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS), shouldAbort);
    }
  }

  private async pauseBetweenBuckets(
    requestsUsed: number,
    onProgress?: FetchOptions['onProgress'],
    shouldAbort?: () => boolean,
  ) {
    const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
    onProgress?.({ done: requestsUsed, stage: `Пауза перед наступним бакетом ~${Math.round(delay / 1000)}с` });
    await interruptibleSleep(delay, shouldAbort);
  }
}
