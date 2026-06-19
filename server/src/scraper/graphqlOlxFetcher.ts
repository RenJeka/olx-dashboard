import type {
  OlxFetcher,
  SearchConfig,
  RawListing,
  FetchSearchResult,
  FetchOptions,
} from '../types.js';

const GRAPHQL_URL = 'https://www.olx.ua/apigateway/graphql';
const PAGE_LIMIT = 40;
/** Розмір батчу запитів — ліміт звичайного скану і крок паузи у глибокому. */
const BATCH_SIZE = 3;
/** Абсолютний запобіжник для глибокого скану (на випадок аномального visible_total_count). */
const DEEP_SAFETY_CAP = 50;
/**
 * Максимальний валідний offset GraphQL OLX (верифіковано живими запитами 2026-06-12:
 * offset=1000 → OK, offset=1040 → ListingError 400 "Data validation error occurred").
 */
const MAX_OFFSET = 1000;
/** Кількість запитів від offset=0 до offset=MAX_OFFSET включно. */
const MAX_PAGES = MAX_OFFSET / PAGE_LIMIT + 1;

// ── Авто-розбиття глибокого скану по цінових діапазонах (docs/plans/price-range-split.md) ──
/** Поріг visible_total_count, за яким бакет ще ділиться (= вікно пагінації OLX). */
const SPLIT_THRESHOLD = MAX_OFFSET;
/** Мінімальна ширина цінового діапазону (грн) — вужче ділити немає сенсу. */
const MIN_PRICE_WIDTH = 1;
/** Глобальний запобіжник: максимум листів-бакетів (проти лавини запитів). */
const MAX_BUCKETS = 40;
/** Глобальний запобіжник: максимум HTTP-запитів на весь split-скан. */
const MAX_TOTAL_REQUESTS = 200;
/**
 * Кандидати `sort_by` для зондування максимальної ціни (probeMaxPrice). OLX може приймати
 * не всі — probe сам валідовує результат (сторінка має бути впорядкована за ціною спадно),
 * тож хибний/проігнорований ключ безпечно дасть `null` (fallback на звичайний deep).
 * ⚠️ Live-верифікація сортування за ціною не виконана у build-середовищі (мережа до OLX
 * заблокована); probe самоперевіряється у рантаймі — деталі у docs/olx-api.md §2.9.
 */
const PRICE_SORT_CANDIDATES = ['filter_float_price:desc', 'price:desc'];
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 2000;
/** Пауза між батчами у глибокому скані — щоб не «DDoS»-ити OLX. */
const BATCH_PAUSE_MIN_MS = 3000;
const BATCH_PAUSE_MAX_MS = 6000;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

// Скорочений query (дослівно з docs/olx-api.md §2.4) — лише поля, які нам потрібні.
const LISTING_SEARCH_QUERY = `query ListingSearchQuery($searchParameters: [SearchParameter!] = []) {
  clientCompatibleListings(searchParameters: $searchParameters) {
    __typename
    ... on ListingSuccess {
      data {
        id
        title
        url
        status
        created_time
        last_refresh_time
        business
        location {
          city { name }
          district { name }
        }
        photos { link }
        params {
          key
          name
          type
          value {
            __typename
            ... on PriceParam { value currency negotiable label }
            ... on GenericParam { key label }
          }
        }
        description
        user { name }
        contact { name }
      }
      metadata { total_elements visible_total_count }
    }
    ... on ListingError {
      error { code title detail status }
    }
  }
}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

function batchPauseDelay(): number {
  return BATCH_PAUSE_MIN_MS + Math.floor(Math.random() * (BATCH_PAUSE_MAX_MS - BATCH_PAUSE_MIN_MS));
}

/** Слаг для Referer (формат `q-<...>`, як у HtmlOlxFetcher). */
function slugify(query: string): string {
  const slug = query.trim().toLowerCase().replace(/\s+/g, '-');
  return encodeURIComponent(slug);
}

interface SearchParameter {
  key: string;
  value: string;
}

/** Значення параметра оголошення. Поля заповнені залежно від __typename (PriceParam/GenericParam/інше). */
interface GraphqlParamValue {
  __typename: string;
  value?: number;
  currency?: string;
  negotiable?: boolean;
  label?: string;
  key?: string;
}

interface GraphqlParam {
  key: string;
  name: string;
  type: string;
  value: GraphqlParamValue;
}

interface GraphqlListing {
  id: number;
  title: string;
  url: string;
  status: string;
  created_time: string;
  last_refresh_time: string;
  business: boolean;
  location?: {
    city?: { name: string } | null;
    district?: { name: string } | null;
  } | null;
  photos?: Array<{ link: string }>;
  params?: GraphqlParam[];
  description?: string | null;
  user?: { name?: string | null } | null;
  contact?: { name?: string | null } | null;
}

interface ListingSuccess {
  __typename: 'ListingSuccess';
  data: GraphqlListing[];
  metadata?: { total_elements: number; visible_total_count: number };
}

interface ListingError {
  __typename: 'ListingError';
  error: { code?: string; title?: string; detail?: string; status?: number };
}

interface GraphqlResponse {
  data?: {
    clientCompatibleListings?: ListingSuccess | ListingError;
  };
  errors?: Array<{ message: string }>;
}

/**
 * Збирач OLX через GraphQL-ендпойнт фронтенду (`/apigateway/graphql`).
 * Без кукі/auth (docs/olx-api.md §2). Стратегія за інтерфейсом OlxFetcher.
 */
export class GraphqlOlxFetcher implements OlxFetcher {
  /**
   * Будує searchParameters для одного запиту (мапінг — docs/olx-api.md §2.2/§2.5).
   * `opts.sortBy` — перевизначити сортування (probeMaxPrice); `opts.priceRange` —
   * перевизначити ціновий діапазон (бакет split-скану), решта range-фільтрів зберігається.
   */
  buildSearchParameters(
    search: SearchConfig,
    offset: number,
    opts?: { sortBy?: string; limit?: number; priceRange?: { from?: number; to?: number } },
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
    opts?: { sortBy?: string; limit?: number; priceRange?: { from?: number; to?: number } },
  ): Promise<{
    items: RawListing[];
    visibleTotalCount: number | null;
    listingError: ListingError['error'] | null;
  }> {
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

  async fetchSearch(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult> {
    const all: RawListing[] = [];
    const seen = new Set<number>();
    const referer = `https://www.olx.ua/uk/list/q-${slugify(search.query)}/`;
    let visibleTotalCount: number | null = null;
    const deep = options?.deep ?? false;
    // Глибокий: ціль уточнюється після 1-го запиту за visible_total_count (або лишається DEEP_SAFETY_CAP),
    // але завжди обмежена MAX_PAGES — вікном пагінації GraphQL OLX.
    let target = deep ? Math.min(DEEP_SAFETY_CAP, MAX_PAGES) : BATCH_SIZE;
    let requestsUsed = 0;
    let exhausted = false;
    let warning: string | undefined;

    for (let i = 0; i < target; i++) {
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

      const items = page.items;

      for (const item of items) {
        if (seen.has(item.olxId)) continue;
        seen.add(item.olxId);
        all.push(item);
      }

      requestsUsed = i + 1;
      options?.onProgress?.({ done: requestsUsed, total: target });

      if (items.length < PAGE_LIMIT) {
        exhausted = true;
        break;
      }

      if (i < target - 1) {
        if (deep && requestsUsed % BATCH_SIZE === 0) {
          await sleep(batchPauseDelay());
        } else {
          await sleep(randomDelay());
        }
      }
    }

    return { listings: all, visibleTotalCount, requestsUsed, exhausted, warning };
  }

  /**
   * Зондує максимальну ціну видачі одним запитом із сортуванням за ціною спадно.
   * САМОПЕРЕВІРКА: повертає число лише якщо повернута сторінка реально впорядкована за
   * ціною (non-increasing) — інакше (OLX проігнорував `sort_by`, як ігнорує `order`)
   * повертає `null`, і оркестратор переходить у режим «без розбиття» (fallback).
   * ⚠️ Live-підтримка price-сортування у OLX GraphQL не верифікована (мережа build-середовища
   * до OLX заблокована); деталі — docs/olx-api.md §2.9.
   */
  async probeMaxPrice(search: SearchConfig): Promise<number | null> {
    const referer = `https://www.olx.ua/uk/list/q-${slugify(search.query)}/`;

    for (const sortBy of PRICE_SORT_CANDIDATES) {
      let page: Awaited<ReturnType<GraphqlOlxFetcher['fetchPage']>>;
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

  /**
   * Глибокий скан із авто-розбиттям по ціні (docs/plans/price-range-split.md).
   * Якщо `visible_total_count > SPLIT_THRESHOLD`, ділить ціновий діапазон бісекцією на
   * під-діапазони, що вкладаються у вікно пагінації OLX, сканує кожен і зливає через
   * дедуп `olxId`. Малі пошуки (≤ вікна) делегуються звичайному `fetchSearch`.
   */
  async fetchSearchSplit(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult> {
    const referer = `https://www.olx.ua/uk/list/q-${slugify(search.query)}/`;
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
      return this.fetchSearch(search, options);
    }

    // 2. Визначаємо межі діапазону. Верхня: явна `to` або probe максимальної ціни.
    const priceRange = search.apiFilters.ranges?.price;
    const lo = priceRange?.from ?? 0;
    let hi: number | null = priceRange?.to ?? null;
    if (hi == null) {
      onProgress?.({ done: requestsUsed, stage: 'Зондування максимальної ціни' });
      hi = await this.probeMaxPrice(search);
      requestsUsed += PRICE_SORT_CANDIDATES.length; // верхня оцінка probe-запитів
      if (hi == null) {
        // Probe не дав надійної верхньої межі — звичайний deep + попередження.
        const res = await this.fetchSearch(search, options);
        return {
          ...res,
          warning: [res.warning, 'split skipped: no upper price bound']
            .filter(Boolean)
            .join('; '),
        };
      }
    }

    // 3. Фаза бісекції (probe): черга інтервалів, кожен «лист» влазить у вікно.
    interface Bucket {
      from: number;
      to: number;
      count: number;
      page0: RawListing[];
    }
    const buckets: Bucket[] = [];
    const queue: Array<{ from: number; to: number }> = [{ from: lo, to: hi }];

    while (queue.length > 0) {
      if (requestsUsed >= MAX_TOTAL_REQUESTS) break;
      const interval = queue.shift()!;
      const page = await this.fetchPage(search, 0, referer, {
        priceRange: { from: interval.from, to: interval.to },
      });
      requestsUsed++;
      // Під час бісекції onProgress НЕ викликаємо: scan_runs.requests_total лишається NULL →
      // фронтенд показує індетермінований стан «Підготовка…» (визначений total знаємо лише
      // після формування листів-бакетів, у фазі скану нижче).

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

    // 4. Оцінка загальної кількості запитів (probe-фаза вже зроблена + допагінація листів).
    const pagesForBucket = (count: number): number =>
      Math.min(MAX_PAGES, Math.max(1, Math.ceil(count / PAGE_LIMIT)));
    const remainingEstimate = buckets.reduce(
      (sum, b) => sum + Math.max(0, pagesForBucket(b.count) - 1),
      0,
    );
    const totalEstimate = requestsUsed + remainingEstimate;

    // 5. Фаза скану листів: допагінація від offset=PAGE_LIMIT, злиття у спільний Map (дедуп).
    const merged = new Map<number, RawListing>();
    for (const item of rootPage.items) merged.set(item.olxId, item);

    let allExhausted = true;
    let capHit = false;

    for (let bi = 0; bi < buckets.length; bi++) {
      const bucket = buckets[bi]!;
      for (const item of bucket.page0) merged.set(item.olxId, item);

      // Бакет вичерпано вже 0-ю сторінкою.
      if (bucket.count <= PAGE_LIMIT || bucket.page0.length < PAGE_LIMIT) {
        continue;
      }

      const pages = pagesForBucket(bucket.count);
      let bucketExhausted = false;

      for (let p = 1; p < pages; p++) {
        if (requestsUsed >= MAX_TOTAL_REQUESTS) {
          capHit = true;
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
          // Бакет усе одно вперся у вікно пагінації — частковий результат, без падіння.
          capHit = true;
          break;
        }

        for (const item of page.items) merged.set(item.olxId, item);

        if (page.items.length < PAGE_LIMIT) {
          bucketExhausted = true;
          break;
        }

        if (requestsUsed % BATCH_SIZE === 0) {
          const delay = batchPauseDelay();
          onProgress?.({ done: requestsUsed, stage: `Пауза ~${Math.round(delay / 1000)}с` });
          await sleep(delay);
        } else {
          await sleep(randomDelay());
        }
      }

      if (!bucketExhausted) allExhausted = false;
      if (requestsUsed >= MAX_TOTAL_REQUESTS) {
        capHit = true;
        break;
      }

      // Пауза між бакетами (ввічливість — як між батчами).
      if (bi < buckets.length - 1) {
        const delay = batchPauseDelay();
        onProgress?.({ done: requestsUsed, stage: `Пауза перед наступним бакетом ~${Math.round(delay / 1000)}с` });
        await sleep(delay);
      }
    }

    const warnings = [`split: ${buckets.length} price buckets; coverage window skipped`];
    if (capHit) warnings.push('some buckets hit pagination/request cap');

    return {
      listings: [...merged.values()],
      visibleTotalCount: rootCount,
      requestsUsed,
      exhausted: allExhausted && !capHit,
      warning: warnings.join('; '),
      bucketsUsed: buckets.length,
    };
  }

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
}
