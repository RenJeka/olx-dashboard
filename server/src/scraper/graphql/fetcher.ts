/**
 * Збирач OLX через GraphQL-ендпойнт фронтенду (`/apigateway/graphql`).
 * Без кукі/auth (docs/olx-api.md §2). Стратегія за інтерфейсом OlxFetcher.
 *
 * Константи — ./constants.ts, типи відповіді — ./types.ts,
 * спільні утиліти (sleep, delay, slugify) — ../utils.ts.
 */

import type {
  OlxFetcher,
  SearchConfig,
  RawListing,
  FetchSearchResult,
  FetchOptions,
} from '../../types.js';

import { interruptibleSleep, randomDelayMs, slugify } from '../utils.js';
import {
  BATCH_SIZE,
  DEEP_SAFETY_CAP,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
  USER_AGENT,
} from '../constants.js';
import {
  GRAPHQL_URL,
  PAGE_LIMIT,
  MAX_OFFSET,
  MAX_PAGES,
  SPLIT_THRESHOLD,
  MIN_PRICE_WIDTH,
  MAX_BUCKETS,
  MAX_TOTAL_REQUESTS,
  PRICE_SORT_CANDIDATES,
  LISTING_SEARCH_QUERY,
} from './constants.js';
import type {
  SearchParameter,
  GraphqlListing,
  ListingError,
  GraphqlResponse,
  PriceBucket,
  SplitPlan,
} from './types.js';

/** Опції побудови searchParameters (перевизначення sort/limit/price для probe та split). */
interface BuildParamsOptions {
  sortBy?: string;
  limit?: number;
  priceRange?: { from?: number; to?: number };
}

/** Результат одного POST до GraphQL (fetchPage). */
interface PageResult {
  items: RawListing[];
  visibleTotalCount: number | null;
  listingError: ListingError['error'] | null;
}

export class GraphqlOlxFetcher implements OlxFetcher {
  /**
   * Будує searchParameters для одного запиту (мапінг — docs/olx-api.md §2.2/§2.5).
   * `opts.sortBy` — перевизначити сортування (probeMaxPrice); `opts.priceRange` —
   * перевизначити ціновий діапазон (бакет split-скану), решта range-фільтрів зберігається.
   */
  buildSearchParameters(
    search: SearchConfig,
    offset: number,
    opts?: BuildParamsOptions,
  ): SearchParameter[] {
    const params: SearchParameter[] = [
      { key: 'query', value: search.query },
      { key: 'offset', value: String(offset) },
      { key: 'limit', value: String(opts?.limit ?? PAGE_LIMIT) },
      // Без цього ключа OLX віддає видачу за релевантністю — вікно покриття statusEngine
      // втрачає сенс. Фактичний порядок — last_refresh_time DESC з промо-вкрапленнями
      // зверху (ключ 'order' ігнорується; verified live 2026-06-12, docs/olx-api.md §2).
      { key: 'sort_by', value: opts?.sortBy ?? 'created_at:desc' },
    ];

    const { ranges, enums, privateOnly } = search.apiFilters;

    if (ranges) {
      for (const [name, range] of Object.entries(ranges)) {
        // Ціновий діапазон у split-скані задається через opts.priceRange (бакет) — пропускаємо
        // власний price з apiFilters, щоб не дублювати/конфліктувати ключі.
        if (name === 'price' && opts?.priceRange) continue;
        if (range.from != null) {
          params.push({ key: `filter_float_${name}:from`, value: String(range.from) });
        }
        if (range.to != null) {
          params.push({ key: `filter_float_${name}:to`, value: String(range.to) });
        }
      }
    }

    if (opts?.priceRange) {
      if (opts.priceRange.from != null) {
        params.push({ key: 'filter_float_price:from', value: String(opts.priceRange.from) });
      }
      if (opts.priceRange.to != null) {
        params.push({ key: 'filter_float_price:to', value: String(opts.priceRange.to) });
      }
    }

    if (enums) {
      for (const [name, values] of Object.entries(enums)) {
        values.forEach((value, i) => {
          params.push({ key: `filter_enum_${name}[${i}]`, value });
        });
      }
    }

    if (privateOnly) {
      params.push({ key: 'owner_type', value: 'private' });
    }

    return params;
  }

  /**
   * Один POST до GraphQL: повертає замаплені оголошення, visible_total_count і — якщо OLX
   * відповів `ListingError` — об'єкт помилки (БЕЗ кидання, щоб виклик сам вирішив, чи це
   * вичерпане вікно пагінації). HTTP/схемні помилки кидаються (їх ловить fallback у scanner).
   */
  private async fetchPage(
    search: SearchConfig,
    offset: number,
    referer: string,
    opts?: BuildParamsOptions,
  ): Promise<PageResult> {
    const searchParameters = this.buildSearchParameters(search, offset, opts);

    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Language': 'uk',
        Origin: 'https://www.olx.ua',
        Referer: referer,
        'X-Client': 'DESKTOP',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        query: LISTING_SEARCH_QUERY,
        variables: { searchParameters },
      }),
    });

    if (!res.ok) {
      throw new Error(`OLX GraphQL повернув HTTP ${res.status} для offset=${offset}`);
    }

    const json = (await res.json()) as GraphqlResponse;

    if (json.errors && json.errors.length > 0) {
      throw new Error(
        `OLX GraphQL: помилка схеми/запиту — ${json.errors.map((e) => e.message).join('; ')}`,
      );
    }

    const result = json.data?.clientCompatibleListings;

    if (!result) {
      throw new Error('OLX GraphQL: відповідь без data.clientCompatibleListings');
    }

    if (result.__typename === 'ListingError') {
      return { items: [], visibleTotalCount: null, listingError: result.error };
    }

    return {
      items: result.data.map((item) => this.mapListing(item)),
      visibleTotalCount: result.metadata?.visible_total_count ?? null,
      listingError: null,
    };
  }

  /** Перетворює ListingError-об'єкт у текст помилки (для throw поза вікном пагінації). */
  private listingErrorMessage(error: ListingError['error']): string {
    const { code, title, detail, status } = error;
    return (
      `OLX GraphQL ListingError: code=${code ?? '?'} status=${status ?? '?'} ` +
      `title="${title ?? ''}" detail="${detail ?? ''}"`
    );
  }

  // ── Звичайний / глибокий скан (без split) ────────────────────────────────────

  async fetchSearch(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult> {
    const all: RawListing[] = [];
    const seen = new Set<number>();
    const referer = this.buildReferer(search.query);
    let visibleTotalCount: number | null = null;
    const deep = options?.deep ?? false;
    // Глибокий: ціль уточнюється після 1-го запиту за visible_total_count (або лишається DEEP_SAFETY_CAP),
    // але завжди обмежена MAX_PAGES — вікном пагінації GraphQL OLX.
    let target = deep ? Math.min(DEEP_SAFETY_CAP, MAX_PAGES) : BATCH_SIZE;
    let requestsUsed = 0;
    let exhausted = false;
    let warning: string | undefined;
    let aborted = false;

    for (let i = 0; i < target; i++) {
      if (options?.shouldAbort?.()) {
        aborted = true;
        break;
      }
      const offset = i * PAGE_LIMIT;
      const page = await this.fetchPage(search, offset, referer);

      if (page.listingError) {
        // Вікно пагінації OLX вичерпано (offset > MAX_OFFSET, верифіковано 2026-06-12) —
        // зібране лишається валідним частковим результатом, HTML-fallback не потрібен.
        if (offset > 0 && all.length > 0) {
          warning = `graphql window cap hit at offset=${offset}`;
          break;
        }
        throw new Error(this.listingErrorMessage(page.listingError));
      }

      if (i === 0) {
        visibleTotalCount = page.visibleTotalCount;
        if (deep && visibleTotalCount != null) {
          target = Math.min(DEEP_SAFETY_CAP, MAX_PAGES, Math.ceil(visibleTotalCount / PAGE_LIMIT));
        }
      }

      for (const item of page.items) {
        if (seen.has(item.olxId)) continue;
        seen.add(item.olxId);
        all.push(item);
      }

      requestsUsed = i + 1;
      options?.onProgress?.({ done: requestsUsed, total: target });

      if (page.items.length < PAGE_LIMIT) {
        exhausted = true;
        break;
      }

      if (i < target - 1) {
        if (deep && requestsUsed % BATCH_SIZE === 0) {
          await interruptibleSleep(randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS), options?.shouldAbort);
        } else {
          await interruptibleSleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS), options?.shouldAbort);
        }
      }
    }

    return { listings: all, visibleTotalCount, requestsUsed, exhausted, warning, aborted };
  }

  // ── Probe максимальної ціни ──────────────────────────────────────────────────

  /**
   * Зондує максимальну ціну видачі одним запитом із сортуванням за ціною спадно.
   * САМОПЕРЕВІРКА: повертає число лише якщо повернута сторінка реально впорядкована за
   * ціною (non-increasing) — інакше (OLX проігнорував `sort_by`, як ігнорує `order`)
   * повертає `null`, і оркестратор переходить у режим «без розбиття» (fallback).
   * ⚠️ Live-підтримка price-сортування у OLX GraphQL не верифікована (мережа build-середовища
   * до OLX заблокована); деталі — docs/olx-api.md §2.9.
   */
  async probeMaxPrice(search: SearchConfig): Promise<number | null> {
    const referer = this.buildReferer(search.query);

    for (const sortBy of PRICE_SORT_CANDIDATES) {
      let page: PageResult;
      try {
        page = await this.fetchPage(search, 0, referer, { sortBy, limit: PAGE_LIMIT });
      } catch {
        continue;
      }
      if (page.listingError) continue;

      const prices = page.items
        .map((it) => it.price)
        .filter((p): p is number => p != null);
      if (prices.length < 2) continue;

      // Перевірка впорядкованості за ціною спадно — підтверджує, що OLX врахував sort_by.
      const sorted = prices.every((p, idx) => idx === 0 || p <= prices[idx - 1]!);
      if (sorted) return prices[0]!;
    }

    return null;
  }

  // ── Глибокий скан із авто-розбиттям по ціні (split) ──────────────────────────

  /**
   * Глибокий скан із авто-розбиттям по ціні (docs/plans/price-range-split.md) — суцільним
   * проходом: `analyzeSplit` (probe-фаза) одразу довершується `scanFromPlan` (допагінація).
   * Для двофазного UX (аналіз → звіт → підтверджений запуск) використовуйте ці методи
   * окремо (docs/plans/two-phase-deep-scan.md) — план з `analyzeSplit` можна закешувати й
   * передати у `scanFromPlan` пізніше без повторних probe-запитів.
   */
  async fetchSearchSplit(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult> {
    const plan = await this.analyzeSplit(search, options);
    return this.scanFromPlan(search, plan, options);
  }

  /**
   * Аналітична (probe) фаза split-скану: root-зондування → межі ціни → бісекція на бакети.
   * Жодної допагінації листів — лише видача `SplitPlan`, який `scanFromPlan` довершує без
   * повторних probe-запитів. Малий пошук (≤ вікна) або провал probe верхньої межі ціни →
   * `noSplit: true` (`scanFromPlan` делегує звичайний `fetchSearch`).
   */
  async analyzeSplit(search: SearchConfig, options?: FetchOptions): Promise<SplitPlan> {
    const referer = this.buildReferer(search.query);
    const onProgress = options?.onProgress;
    let requestsUsed = 0;

    onProgress?.({ done: 0, stage: 'Зондування видачі' });

    // 1. Зондуємо корінь: visible_total_count усього пошуку (з власним діапазоном apiFilters).
    const rootPage = await this.fetchPage(search, 0, referer);
    requestsUsed++;
    if (rootPage.listingError) {
      throw new Error(this.listingErrorMessage(rootPage.listingError));
    }
    const rootCount = rootPage.visibleTotalCount;

    // Малий пошук (або без метаданих) — розбиття не потрібне, поведінка як зараз.
    if (rootCount == null || rootCount <= SPLIT_THRESHOLD) {
      return { rootCount, buckets: [], rootItems: rootPage.items, requestsUsed, noSplit: true };
    }

    // 2. Визначаємо межі діапазону. Верхня: явна `to` або probe максимальної ціни.
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

    // 3. Фаза бісекції: черга інтервалів → листи-бакети, що влазять у вікно пагінації.
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
   * Довершує збір за вже готовим `SplitPlan` (допагінація листів-бакетів). `noSplit` —
   * делегує звичайний `fetchSearch` (з попередженням, якщо план виник через провал probe).
   */
  async scanFromPlan(
    search: SearchConfig,
    plan: SplitPlan,
    options?: FetchOptions,
  ): Promise<FetchSearchResult> {
    if (plan.noSplit) {
      const res = await this.fetchSearch(search, options);
      if (!plan.fallbackReason) return res;
      return {
        ...res,
        warning: [res.warning, `split skipped: ${plan.fallbackReason}`].filter(Boolean).join('; '),
      };
    }

    const referer = this.buildReferer(search.query);
    const onProgress = options?.onProgress;
    const scanResult = await this.scanBuckets(
      search, referer, plan.rootItems, plan.buckets, plan.requestsUsed, onProgress, options?.shouldAbort,
    );

    const warnings = [`split: ${plan.buckets.length} price buckets; coverage window skipped`];
    if (scanResult.capHit) {
      warnings.push('деякі діапазони вперлися в ліміт запитів — дані можуть бути неповними');
    }

    return {
      listings: scanResult.listings,
      visibleTotalCount: plan.rootCount,
      requestsUsed: scanResult.requestsUsed,
      exhausted: scanResult.allExhausted && !scanResult.capHit,
      warning: warnings.join('; '),
      bucketsUsed: plan.buckets.length,
      aborted: scanResult.aborted,
    };
  }

  // ── Приватні хелпери split-скану ─────────────────────────────────────────────

  /** Визначає верхню межу ціни для split-скану: явна `to` з apiFilters або probe. */
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
    requestsUsed += PRICE_SORT_CANDIDATES.length; // верхня оцінка probe-запитів

    return { upperBound: maxPrice, requestsUsed };
  }

  /**
   * Фаза бісекції: ділить [lo, hi] на бакети, кожен з visible_total_count ≤ SPLIT_THRESHOLD.
   * Черга BFS — інтервали, що не вмістились, діляться навпіл.
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
      const page = await this.fetchPage(search, 0, referer, {
        priceRange: { from: interval.from, to: interval.to },
      });
      requestsUsed++;
      // Під час бісекції onProgress НЕ передає total: scan_runs.requests_total лишається NULL →
      // фронтенд показує індетермінований стан «Підготовка…».

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
   * Фаза сканування бакетів: допагінація кожного бакету від offset=PAGE_LIMIT, злиття у Map.
   * rootItems — оголошення з 0-ї сторінки кореневого запиту (вже завантажені).
   */
  private async scanBuckets(
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

    // Оцінка загальної кількості запитів (probe-фаза вже зроблена + допагінація листів).
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

      // Бакет вичерпано вже 0-ю сторінкою.
      if (bucket.count <= PAGE_LIMIT || bucket.page0.length < PAGE_LIMIT) {
        continue;
      }

      const pages = estimatePages(bucket.count);
      let bucketExhausted = false;

      for (let p = 1; p < pages; p++) {
        if (requestsUsed >= MAX_TOTAL_REQUESTS) {
          capHit = true;
          break;
        }
        if (shouldAbort?.()) {
          aborted = true;
          break;
        }
        const offset = p * PAGE_LIMIT;
        const page = await this.fetchPage(search, offset, referer, {
          priceRange: { from: bucket.from, to: bucket.to },
        });
        requestsUsed++;
        onProgress?.({
          done: requestsUsed,
          total: totalEstimate,
          method: 'GraphQL',
          stage: `Бакет ₴${bucket.from}–${bucket.to} · стор. ${p}/${pages}`,
          subDone: bi + 1,
          subTotal: buckets.length,
        });

        if (page.listingError) {
          // Бакет вперся у вікно пагінації — частковий результат, без падіння.
          capHit = true;
          break;
        }

        for (const item of page.items) merged.set(item.olxId, item);

        if (page.items.length < PAGE_LIMIT) {
          bucketExhausted = true;
          break;
        }

        if (requestsUsed % BATCH_SIZE === 0) {
          const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
          onProgress?.({ done: requestsUsed, stage: `Пауза ~${Math.round(delay / 1000)}с` });
          await interruptibleSleep(delay, shouldAbort);
        } else {
          await interruptibleSleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS), shouldAbort);
        }
      }

      if (aborted) break;
      if (!bucketExhausted) allExhausted = false;
      if (requestsUsed >= MAX_TOTAL_REQUESTS) {
        capHit = true;
        break;
      }

      // Пауза між бакетами (ввічливість — як між батчами).
      if (bi < buckets.length - 1) {
        const delay = randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
        onProgress?.({ done: requestsUsed, stage: `Пауза перед наступним бакетом ~${Math.round(delay / 1000)}с` });
        await interruptibleSleep(delay, shouldAbort);
      }
    }

    return { listings: [...merged.values()], requestsUsed, allExhausted, capHit, aborted };
  }

  // ── Маппінг і хелпери ────────────────────────────────────────────────────────

  /** Мапить GraphQL-оголошення у RawListing (мапінг полів — docs/olx-api.md §2.7). */
  private mapListing(item: GraphqlListing): RawListing {
    let price: number | null = null;
    let currency = 'UAH';
    const params: Record<string, string> = {};

    for (const param of item.params ?? []) {
      if (param.key === 'price' && param.value.__typename === 'PriceParam') {
        price = param.value.value ?? null;
        currency = param.value.currency ?? 'UAH';
        continue;
      }

      const label = param.value.label ?? param.value.key;
      if (label != null) {
        params[param.key] = label;
      }
    }

    const rawPhoto = item.photos?.[0]?.link;
    const photoUrl = rawPhoto?.replace('{width}x{height}', '400x300');
    // Усі фото у прев'ю-розмірі для галереї при наведенні (більший за мініатюру).
    const photoUrls = (item.photos ?? [])
      .map((p) => p.link?.replace('{width}x{height}', '600x450'))
      .filter((link): link is string => Boolean(link));

    return {
      olxId: item.id,
      title: item.title,
      rawPrice: '',
      url: item.url,
      photoUrl,
      photoUrls,
      price,
      currency,
      createdAt: item.created_time,
      lastRefreshAt: item.last_refresh_time,
      city: item.location?.city?.name,
      district: item.location?.district?.name,
      sellerType: item.business ? 'business' : 'private',
      params,
      description: item.description ?? undefined,
      sellerName: item.user?.name ?? undefined,
      contactName: item.contact?.name ?? undefined,
      olxStatus: item.status,
    };
  }

  /** Будує Referer-заголовок для запитів до OLX. */
  private buildReferer(query: string): string {
    return `https://www.olx.ua/uk/list/q-${slugify(query)}/`;
  }
}

/**
 * Оцінює кількість сторінок для бакету з `count` оголошень
 * (обмежено MAX_PAGES — вікном пагінації GraphQL OLX).
 */
export function estimatePages(count: number): number {
  return Math.min(MAX_PAGES, Math.max(1, Math.ceil(count / PAGE_LIMIT)));
}
