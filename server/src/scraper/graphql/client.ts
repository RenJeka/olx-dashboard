import type { SearchConfig, RawListing } from '../../types.js';
import { USER_AGENT } from '../constants.js';
import { GRAPHQL_URL, PAGE_LIMIT, LISTING_SEARCH_QUERY } from './constants.js';
import type { SearchParameter, ListingError, GraphqlResponse } from './types.js';
import { slugify } from '../utils.js';
import { GraphqlListingMapper } from './mapper.js';

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
      items: result.data.map((item) => this.mapper.mapListing(item)),
      visibleTotalCount: result.metadata?.visible_total_count ?? null,
      listingError: null,
    };
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
