import type { SearchConfig, RawListing } from '../../types.js';
import { USER_AGENT } from '../constants.js';
import { GRAPHQL_URL, PAGE_LIMIT, LISTING_SEARCH_QUERY } from './constants.js';
import type { SearchParameter, ListingError, GraphqlResponse } from './types.js';
import { slugify, sleep, randomDelayMs } from '../utils.js';
import { GraphqlListingMapper } from './mapper.js';

/**
 * Скільки разів повторити запит при ТРАНЗІЄНТНОМУ збої (мережа / HTTP 429,5xx / не-JSON
 * анти-бот-інтерстіціал). Один блип серед десятків запитів глибокого скану валив увесь
 * прохід (інцидент 2026-06-30: deep-скан після «Аналізу» падав із проковтнутою причиною
 * GraphQL і оманливою HTML-помилкою «рендериться через JS»). Детерміновані помилки
 * (400/404, ListingError вікна пагінації, помилка схеми) НЕ ретраяться.
 */
const MAX_ATTEMPTS = 3;
/** HTTP-статуси, які вважаємо тимчасовими й вартими повтору. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface BuildParamsOptions {
  sortBy?: string;
  limit?: number;
  priceRange?: { from?: number; to?: number };
}

export interface PageResult {
  items: RawListing[];
  visibleTotalCount: number | null;
  listingError: ListingError['error'] | null;
}

/**
 * Відповідає за мережевий шар: побудова POST-запиту, заголовків, 
 * серіалізацію параметрів пошуку та обробку HTTP/GraphQL помилок.
 * Нічого не знає про логіку сканування (бакети, сторінки, паузи).
 */
export class GraphqlClient {
  private mapper = new GraphqlListingMapper();

  /**
   * Будує `searchParameters` (фільтри, ліміти, сортування) 
   * для відправки в тілі GraphQL запиту.
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
      { key: 'sort_by', value: opts?.sortBy ?? 'created_at:desc' },
    ];

    const { ranges, enums, privateOnly } = search.apiFilters;

    if (ranges) {
      for (const [name, range] of Object.entries(ranges)) {
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
   * Виконує один мережевий запит до OLX GraphQL API.
   * Парсить відповідь, викликає `GraphqlListingMapper` для трансформації оголошень
   * і обробляє помилки.
   */
  async fetchPage(
    search: SearchConfig,
    offset: number,
    referer: string,
    opts?: BuildParamsOptions,
  ): Promise<PageResult> {
    const searchParameters = this.buildSearchParameters(search, offset, opts);
    const body = JSON.stringify({
      query: LISTING_SEARCH_QUERY,
      variables: { searchParameters },
    });

    // Один транзієнтний збій (мережа / 429 / 5xx / анти-бот не-JSON) не повинен валити
    // увесь скан: повторюємо до MAX_ATTEMPTS з бекофом. Детерміновані помилки кидаються одразу.
    let lastTransient = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(GRAPHQL_URL, {
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
          body,
        });
      } catch (err) {
        // Мережевий збій (reset/timeout/DNS) — транзієнтний.
        lastTransient = `мережева помилка: ${err instanceof Error ? err.message : String(err)}`;
        if (attempt < MAX_ATTEMPTS) {
          await this.backoff(attempt);
          continue;
        }
        throw new Error(
          `OLX GraphQL недоступний (offset=${offset}) після ${MAX_ATTEMPTS} спроб: ${lastTransient}`,
        );
      }

      if (!res.ok) {
        if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
          lastTransient = `HTTP ${res.status}`;
          await this.backoff(attempt);
          continue;
        }
        throw new Error(`OLX GraphQL повернув HTTP ${res.status} для offset=${offset}`);
      }

      // Анти-бот-інтерстіціал інколи приходить як 200 з HTML-тілом — це теж транзієнтно.
      const text = await res.text();
      let json: GraphqlResponse;
      try {
        json = JSON.parse(text) as GraphqlResponse;
      } catch {
        lastTransient = `не-JSON відповідь (${res.headers.get('content-type') ?? '?'}, ${text.length} б)`;
        if (attempt < MAX_ATTEMPTS) {
          await this.backoff(attempt);
          continue;
        }
        throw new Error(
          `OLX GraphQL віддав не-JSON для offset=${offset} після ${MAX_ATTEMPTS} спроб: ${lastTransient}`,
        );
      }

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
        items: result.data.map((item) => this.mapper.mapListing(item)),
        visibleTotalCount: result.metadata?.visible_total_count ?? null,
        listingError: null,
      };
    }

    // Недосяжно (цикл або повертає, або кидає), але задовольняє контроль типів.
    throw new Error(`OLX GraphQL: вичерпано спроби (offset=${offset}): ${lastTransient}`);
  }

  /** Бекоф між повторами транзієнтного збою: ~1.2с, ~2.5с (+джитер) — ввічливо до OLX. */
  private backoff(attempt: number): Promise<void> {
    const base = attempt * 1000;
    return sleep(randomDelayMs(base, base + 1500));
  }

  /** Перетворює об'єкт помилки GraphQL на текстове повідомлення. */
  listingErrorMessage(error: ListingError['error']): string {
    const { code, title, detail, status } = error;
    return (
      `OLX GraphQL ListingError: code=${code ?? '?'} status=${status ?? '?'} ` +
      `title="${title ?? ''}" detail="${detail ?? ''}"`
    );
  }

  /** Будує Referer для запитів, щоб імітувати реальний браузер. */
  buildReferer(query: string): string {
    return `https://www.olx.ua/uk/list/q-${slugify(query)}/`;
  }
}
