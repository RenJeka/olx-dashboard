/**
 * Збирач OLX через GraphQL-ендпойнт фронтенду (`/apigateway/graphql`).
 * Без кукі/auth (docs/olx-api.md §2). Стратегія за інтерфейсом OlxFetcher.
 * Цей клас тепер є оркестратором (Фасадом) для GraphqlClient та SplitScanner.
 */

import type {
  OlxFetcher,
  SearchConfig,
  RawListing,
  FetchSearchResult,
  FetchOptions,
} from '../../types.js';

import { interruptibleSleep, randomDelayMs } from '../utils.js';
import {
  BATCH_SIZE,
  DEEP_SAFETY_CAP,
  MIN_DELAY_MS,
  MAX_DELAY_MS,
  BATCH_PAUSE_MIN_MS,
  BATCH_PAUSE_MAX_MS,
} from '../constants.js';
import { PAGE_LIMIT, MAX_PAGES } from './constants.js';
import type { SplitPlan } from './types.js';

import { GraphqlClient } from './client.js';
import type { PageResult } from './client.js';
import { SplitScanner } from './split.js';
export { estimatePages } from './split.js';

export class GraphqlOlxFetcher implements OlxFetcher {
  private client = new GraphqlClient();
  private splitScanner = new SplitScanner(this.client);

  async fetchSearch(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult> {
    const all: RawListing[] = [];
    const seen = new Set<number>();
    const referer = this.client.buildReferer(search.query);
    let visibleTotalCount: number | null = null;
    const deep = options?.deep ?? false;
    
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
      let page: PageResult;
      try {
        page = await this.client.fetchPage(search, offset, referer);
      } catch (err) {
        // Транзієнтний збій вичерпав ретраї (client.fetchPage). Якщо вже є зібрані дані —
        // зупиняємось частковим успіхом (як для ListingError вікна пагінації нижче): не валимо
        // весь скан і не тягнемо HTML-fallback. Якщо даних ще нема (offset=0) — кидаємо, щоб
        // HTML-fallback дістав шанс.
        if (offset > 0 && all.length > 0) {
          warning = `graphql transient fail at offset=${offset}: ${err instanceof Error ? err.message : String(err)}`;
          break;
        }
        throw err;
      }

      if (page.listingError) {
        if (offset > 0 && all.length > 0) {
          warning = `graphql window cap hit at offset=${offset}`;
          break;
        }
        throw new Error(this.client.listingErrorMessage(page.listingError));
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
        await this.applySmartPause(requestsUsed, deep, undefined, options?.shouldAbort);
      }
    }

    return { listings: all, visibleTotalCount, requestsUsed, exhausted, warning, aborted };
  }

  async probeRootCount(search: SearchConfig): Promise<number | null> {
    const referer = this.client.buildReferer(search.query);
    const page = await this.client.fetchPage(search, 0, referer);
    if (page.listingError) return null;
    return page.visibleTotalCount;
  }

  async probeMaxPrice(search: SearchConfig): Promise<number | null> {
    return this.splitScanner.probeMaxPrice(search);
  }

  async fetchSearchSplit(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult> {
    const plan = await this.splitScanner.analyzeSplit(search, options);
    return this.scanFromPlan(search, plan, options);
  }

  async analyzeSplit(search: SearchConfig, options?: FetchOptions): Promise<SplitPlan> {
    return this.splitScanner.analyzeSplit(search, options);
  }

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

    const referer = this.client.buildReferer(search.query);
    const onProgress = options?.onProgress;
    const scanResult = await this.splitScanner.scanBuckets(
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
}
