import type { RawListing } from '../../types.js';
import { GraphqlClient } from './client.js';
import { MAX_PAGES, PAGE_LIMIT } from './constants.js';
import type { SearchParameter } from './types.js';

/**
 * Перевірка оголошень без HTML-сторінок (docs/plans/verify-graphql.md, частина 2): OLX віддає
 * `403` на сторінки з Node, тому verify дивиться в ту саму GraphQL-видачу, що й скан.
 * Видача містить лише активні оголошення (перевірено live 2026-10-25, docs/olx-api.md §2.12):
 * - видача продавця (`user_id`) — сильний доказ: вичерпана видача без оголошення = неактивне;
 * - пошук за точною назвою (`query`) — для рядків без `seller_id`; не знайдено — лише промах.
 */

/** Видача більша за це — фільтр `user_id` OLX проігнорував (невідомі ключі він мовчки відкидає). */
const SELLER_FEED_SANITY_MAX = 50_000;

const REFERER = 'https://www.olx.ua/uk/list/';

export interface FeedResult {
  /** Оголошення видачі за olx_id. */
  items: Map<number, RawListing>;
  /** Видачу пройдено до кінця — відсутність оголошення в ній доведена. */
  exhausted: boolean;
}

export interface VerifyProbe {
  /** Скільки GraphQL-запитів уже зроблено (ліміт проходу рахує runVerify). */
  readonly requestsUsed: number;
  /** Усі активні оголошення продавця, не більше `maxRequests` сторінок. */
  sellerFeed(sellerId: number, maxRequests: number): Promise<FeedResult>;
  /** Перша сторінка пошуку за точною назвою. */
  byTitle(title: string): Promise<FeedResult>;
}

/**
 * `pace` викликається перед кожним запитом, крім першого (паузи — як у глибокому скані; задає
 * runVerify, тести підміняють). Помилки GraphQL (після ретраїв клієнта) кидаються нагору.
 */
export function createVerifyProbe(pace: (requestsUsed: number) => Promise<void>): VerifyProbe {
  const client = new GraphqlClient();
  let requestsUsed = 0;

  async function request(params: SearchParameter[], label: string, query: string) {
    if (requestsUsed > 0) await pace(requestsUsed);
    requestsUsed++;
    const page = await client.fetchByParameters(params, REFERER, label, query);
    if (page.listingError) throw new Error(client.listingErrorMessage(page.listingError));
    return page;
  }

  return {
    get requestsUsed() {
      return requestsUsed;
    },

    async sellerFeed(sellerId, maxRequests) {
      const items = new Map<number, RawListing>();
      const pages = Math.min(MAX_PAGES, maxRequests);
      for (let p = 0; p < pages; p++) {
        const offset = p * PAGE_LIMIT;
        const page = await request(
          [
            { key: 'user_id', value: String(sellerId) },
            { key: 'offset', value: String(offset) },
            { key: 'limit', value: String(PAGE_LIMIT) },
            { key: 'sort_by', value: 'created_at:desc' },
          ],
          `user_id=${sellerId} offset=${offset}`,
          `user_id=${sellerId}`,
        );
        const total = page.visibleTotalCount;
        // Захист від мовчазного ігнорування фільтра: чужий продавець у видачі або видача на пів OLX.
        if ((total != null && total > SELLER_FEED_SANITY_MAX) || page.items.some((it) => it.sellerId !== sellerId)) {
          throw new Error(`OLX проігнорував фільтр user_id=${sellerId} (видача ${total ?? '?'}) — перевірку зупинено`);
        }
        for (const item of page.items) items.set(item.olxId, item);
        const seenAll = total != null && offset + PAGE_LIMIT >= total;
        if (page.items.length < PAGE_LIMIT || seenAll) {
          // Вікно OLX — 1000 оголошень: продавець більший за нього до кінця не проходиться.
          return { items, exhausted: total == null || total <= MAX_PAGES * PAGE_LIMIT };
        }
      }
      return { items, exhausted: false };
    },

    async byTitle(title) {
      const page = await request(
        [
          { key: 'query', value: title },
          { key: 'offset', value: '0' },
          { key: 'limit', value: String(PAGE_LIMIT) },
        ],
        'title offset=0',
        title,
      );
      const items = new Map(page.items.map((it) => [it.olxId, it] as const));
      const total = page.visibleTotalCount;
      return { items, exhausted: page.items.length < PAGE_LIMIT || (total != null && total <= PAGE_LIMIT) };
    },
  };
}
