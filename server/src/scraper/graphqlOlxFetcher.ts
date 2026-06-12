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
  /** Будує searchParameters для одного запиту (мапінг — docs/olx-api.md §2.2/§2.5). */
  buildSearchParameters(search: SearchConfig, offset: number): SearchParameter[] {
    const params: SearchParameter[] = [
      { key: 'query', value: search.query },
      { key: 'offset', value: String(offset) },
      { key: 'limit', value: String(PAGE_LIMIT) },
      // Без цього ключа OLX віддає видачу за релевантністю — вікно покриття statusEngine
      // втрачає сенс. Фактичний порядок — last_refresh_time DESC з промо-вкрапленнями
      // зверху (ключ 'order' ігнорується; verified live 2026-06-12, docs/olx-api.md §2).
      { key: 'sort_by', value: 'created_at:desc' },
    ];

    const { ranges, enums, privateOnly } = search.apiFilters;

    if (ranges) {
      for (const [name, range] of Object.entries(ranges)) {
        if (range.from != null) {
          params.push({ key: `filter_float_${name}:from`, value: String(range.from) });
        }
        if (range.to != null) {
          params.push({ key: `filter_float_${name}:to`, value: String(range.to) });
        }
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
      const searchParameters = this.buildSearchParameters(search, offset);

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
        const { code, title, detail, status } = result.error;

        // Вікно пагінації OLX вичерпано (offset > MAX_OFFSET, верифіковано 2026-06-12) —
        // зібране лишається валідним частковим результатом, HTML-fallback не потрібен.
        if (offset > 0 && all.length > 0) {
          warning = `graphql window cap hit at offset=${offset}`;
          break;
        }

        throw new Error(
          `OLX GraphQL ListingError: code=${code ?? '?'} status=${status ?? '?'} ` +
            `title="${title ?? ''}" detail="${detail ?? ''}"`,
        );
      }

      if (i === 0) {
        visibleTotalCount = result.metadata?.visible_total_count ?? null;
        if (deep && visibleTotalCount != null) {
          target = Math.min(DEEP_SAFETY_CAP, MAX_PAGES, Math.ceil(visibleTotalCount / PAGE_LIMIT));
        }
      }

      const items = result.data;

      for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        all.push(this.mapListing(item));
      }

      requestsUsed = i + 1;
      options?.onProgress?.(requestsUsed, target);

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

    return {
      olxId: item.id,
      title: item.title,
      rawPrice: '',
      url: item.url,
      photoUrl,
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
