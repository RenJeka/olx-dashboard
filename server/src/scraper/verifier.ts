import * as cheerio from 'cheerio';
import { SELECTORS, REQUEST_HEADERS } from './selectors.js';

export type ProbeVerdict = 'alive' | 'dead' | 'unknown';

export interface ProbeResult {
  verdict: ProbeVerdict;
  /** HTTP-статус відповіді (null — мережева помилка); для note/логів. */
  httpStatus: number | null;
  /** HTML-опис (з <br /> тегами, як у GraphQL) — заповнено лише при verdict='alive'. */
  description: string | null;
  /** Імʼя продавця — заповнено лише при verdict='alive'. */
  sellerName: string | null;
}

/**
 * Проба однієї сторінки оголошення (verify-прохід, A3). Маркери верифіковано live
 * 2026-06-12 (docs/olx-api.md §3.4):
 * - 404 | 410 → `dead` (оголошення зникло з OLX);
 * - 200 з присутнім `[data-testid="ad_description"]` → `alive`, опис/продавець для backfill;
 * - 200 без `ad_description` (JS-only/невідомий лейаут), 3xx (`redirect: 'manual'` —
 *   не йдемо за редіректом), інші коди чи мережева помилка → `unknown`
 *   (статус оголошення НЕ змінюється).
 */
export async function probeListingPage(url: string): Promise<ProbeResult> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS, redirect: 'manual' });
    const httpStatus = res.status;

    if (httpStatus === 404 || httpStatus === 410) {
      return { verdict: 'dead', httpStatus, description: null, sellerName: null };
    }

    if (httpStatus === 200) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const descriptionEl = $(SELECTORS.detailDescription);

      if (descriptionEl.length === 0) {
        return { verdict: 'unknown', httpStatus, description: null, sellerName: null };
      }

      const description = descriptionEl.first().html()?.trim() || null;
      const sellerName =
        $(SELECTORS.detailSellerName).first().text().trim() ||
        $(SELECTORS.detailTrader).first().text().trim() ||
        null;

      return { verdict: 'alive', httpStatus, description, sellerName };
    }

    return { verdict: 'unknown', httpStatus, description: null, sellerName: null };
  } catch {
    return { verdict: 'unknown', httpStatus: null, description: null, sellerName: null };
  }
}
