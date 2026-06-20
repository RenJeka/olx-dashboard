import * as cheerio from 'cheerio';
import type {
  OlxFetcher,
  SearchConfig,
  RawListing,
  FetchSearchResult,
  FetchOptions,
} from '../types.js';
import { SELECTORS, OLX_BASE_URL, REQUEST_HEADERS } from './selectors.js';
import { sleep, randomDelayMs, slugify } from './utils.js';
import {
  BATCH_SIZE,
  DEEP_SAFETY_CAP,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
} from './constants.js';

/**
 * Збирач OLX через звичайний fetch + парсинг server-rendered HTML (cheerio).
 * БЕЗ браузера/Playwright. Стратегія ізольована за інтерфейсом OlxFetcher.
 */
export class HtmlOlxFetcher implements OlxFetcher {
  /** Будує URL сторінки пошуку з SearchConfig (range/enum/private у форматі OLX). */
  buildUrl(search: SearchConfig, page: number): string {
    const base = `${OLX_BASE_URL}/d/uk/list/q-${slugify(search.query)}/`;

    // Дужки в іменах параметрів лишаємо літеральними (формат OLX), значення кодуємо.
    const parts: string[] = [
      'currency=UAH',
      'search[order]=created_at:desc',
      'view=list',
    ];

    const { ranges, enums, privateOnly } = search.apiFilters;

    if (ranges) {
      for (const [name, range] of Object.entries(ranges)) {
        if (range.from != null) {
          parts.push(`search[filter_float_${name}:from]=${range.from}`);
        }
        if (range.to != null) {
          parts.push(`search[filter_float_${name}:to]=${range.to}`);
        }
      }
    }

    if (enums) {
      for (const [name, values] of Object.entries(enums)) {
        values.forEach((value, i) => {
          parts.push(
            `search[filter_enum_${name}][${i}]=${encodeURIComponent(value)}`,
          );
        });
      }
    }

    if (privateOnly) {
      parts.push('search[private_business]=private');
    }

    if (page > 1) {
      parts.push(`page=${page}`);
    }

    return `${base}?${parts.join('&')}`;
  }

  async fetchSearch(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult> {
    const all: RawListing[] = [];
    const seen = new Set<number>();
    const deep = options?.deep ?? false;
    // HTML не дає visible_total_count — для глибокого ціль одразу DEEP_SAFETY_CAP.
    const target = deep ? DEEP_SAFETY_CAP : BATCH_SIZE;
    let requestsUsed = 0;
    let aborted = false;

    for (let page = 1; page <= target; page++) {
      if (options?.shouldAbort?.()) {
        aborted = true;
        break;
      }
      const url = this.buildUrl(search, page);

      const res = await fetch(url, {
        headers: { ...REQUEST_HEADERS, Referer: url },
      });

      if (!res.ok) {
        throw new Error(`OLX повернув HTTP ${res.status} для ${url}`);
      }

      const html = await res.text();
      requestsUsed = page;
      options?.onProgress?.({ done: requestsUsed, total: target });

      const listings = this.parseList(html);

      // Порожня видача — далі сторінок немає.
      if (listings === null) {
        break;
      }

      if (listings.length === 0) {
        break;
      }

      let addedOnPage = 0;
      for (const item of listings) {
        if (seen.has(item.olxId)) continue;
        seen.add(item.olxId);
        all.push(item);
        addedOnPage++;
      }

      // Якщо всі картки повторюються — нові сторінки не дадуть нічого нового.
      if (addedOnPage === 0) {
        break;
      }

      if (page < target) {
        if (deep && page % BATCH_SIZE === 0) {
          await sleep(randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS));
        } else {
          await sleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS));
        }
      }
    }

    // HTML-сторінка пошуку не дає metadata.visible_total_count — лише GraphQL.
    // exhausted: false — statusEngine для fallback-сканів не викликається (CLAUDE.md).
    return { listings: all, visibleTotalCount: null, requestsUsed, exhausted: false, aborted };
  }

  /**
   * Парсить HTML сторінки пошуку.
   * Повертає null, якщо OLX явно показав порожню видачу (empty-state).
   * Кидає помилку, якщо карток немає І немає empty-state (підозра на JS-only сторінку).
   */
  private parseList(html: string): RawListing[] | null {
    const $ = cheerio.load(html);

    if ($(SELECTORS.emptyState).length > 0) {
      return null;
    }

    const cards = $(SELECTORS.card);

    if (cards.length === 0) {
      // НЕ переходимо на Playwright автоматично (CLAUDE.md). Сигналізуємо нагору.
      const hasNextData = html.includes('__NEXT_DATA__');
      const snippet = html.slice(0, 600).replace(/\s+/g, ' ').trim();
      throw new Error(
        `Карток не знайдено і немає empty-state. ` +
          `__NEXT_DATA__ присутній: ${hasNextData}. ` +
          `Можливо, сторінка рендериться лише через JS — перевір зразок HTML вручну ` +
          `перед будь-яким браузером. Початок HTML: «${snippet}»`,
      );
    }

    const results: RawListing[] = [];

    cards.each((_, el) => {
      const card = $(el);

      const olxId = Number(card.attr('id'));
      if (!Number.isFinite(olxId) || olxId <= 0) {
        return; // картка без числового id (напр. рекламний блок) — пропускаємо
      }

      const title = card.find(SELECTORS.title).first().text().trim();
      const rawPrice = card.find(SELECTORS.price).first().text().trim();

      const href = card.find(SELECTORS.link).first().attr('href') ?? '';
      const url = href.startsWith('http')
        ? href
        : `${OLX_BASE_URL}${href}`;

      const imgSrc = card.find(SELECTORS.image).first().attr('src');
      const photoUrl =
        imgSrc && imgSrc.startsWith('http') ? imgSrc : undefined;

      const locationDate = card
        .find(SELECTORS.locationDate)
        .first()
        .text()
        .trim();

      results.push({
        olxId,
        title,
        rawPrice,
        url,
        photoUrl,
        locationDate: locationDate || undefined,
      });
    });

    return results;
  }
}
