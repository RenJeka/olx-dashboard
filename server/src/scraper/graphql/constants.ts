/**
 * Константи, специфічні для GraphQL-збирача OLX (`/apigateway/graphql`).
 * Спільні константи (BATCH_SIZE, затримки, USER_AGENT) — у ../constants.ts.
 */

/** Ендпойнт GraphQL API OLX. */
export const GRAPHQL_URL = 'https://www.olx.ua/apigateway/graphql';

/** Кількість оголошень на одну сторінку (searchParameters.limit). */
export const PAGE_LIMIT = 40;

/**
 * Максимальний валідний offset GraphQL OLX (верифіковано живими запитами 2026-06-12:
 * offset=1000 → OK, offset=1040 → ListingError 400 "Data validation error occurred").
 */
export const MAX_OFFSET = 1000;

/** Кількість запитів від offset=0 до offset=MAX_OFFSET включно. */
export const MAX_PAGES = MAX_OFFSET / PAGE_LIMIT + 1;

// ── Авто-розбиття глибокого скану по цінових діапазонах (docs/plans/price-range-split.md) ──

/** Поріг visible_total_count, за яким бакет ще ділиться (= вікно пагінації OLX). */
export const SPLIT_THRESHOLD = MAX_OFFSET;

/** Мінімальна ширина цінового діапазону (грн) — вужче ділити немає сенсу. */
export const MIN_PRICE_WIDTH = 1;

/** Глобальний запобіжник: максимум листів-бакетів (проти лавини запитів). */
export const MAX_BUCKETS = 40;

/** Глобальний запобіжник: максимум HTTP-запитів на весь split-скан. */
export const MAX_TOTAL_REQUESTS = 200;

/**
 * Кандидати `sort_by` для зондування максимальної ціни (probeMaxPrice). OLX може приймати
 * не всі — probe сам валідовує результат (сторінка має бути впорядкована за ціною спадно),
 * тож хибний/проігнорований ключ безпечно дасть `null` (fallback на звичайний deep).
 * ⚠️ Live-верифікація сортування за ціною не виконана у build-середовищі (мережа до OLX
 * заблокована); probe самоперевіряється у рантаймі — деталі у docs/olx-api.md §2.9.
 */
export const PRICE_SORT_CANDIDATES = ['filter_float_price:desc', 'price:desc'];

// ── GraphQL query ───────────────────────────────────────────────────────────────

/**
 * Скорочений query (дослівно з docs/olx-api.md §2.4) — лише поля, які нам потрібні.
 * Містить фрагменти ListingSuccess (data + metadata) та ListingError (error).
 */
export const LISTING_SEARCH_QUERY = `query ListingSearchQuery($searchParameters: [SearchParameter!] = []) {
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
