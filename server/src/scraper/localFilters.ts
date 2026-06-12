import type { LocalFilters } from '../types.js';

/** Поля оголошення, потрібні для оцінки локальних фільтрів. */
export interface FilterableListing {
  title: string | null;
  description: string | null;
  params: string | null;
}

const HTML_TAG_RE = /<[^>]*>/g;
const FIRST_NUMBER_RE = /\d+(?:[.,]\d+)?/;

function stripHtml(html: string): string {
  return html.replace(HTML_TAG_RE, ' ');
}

/** parseFloat першого числа в рядку (кома як десятковий роздільник); немає числа → null. */
function extractFirstNumber(label: string): number | null {
  const match = label.match(FIRST_NUMBER_RE);
  if (!match) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isNaN(value) ? null : value;
}

/**
 * Оцінює, чи оголошення підпадає під локальні фільтри пошуку (filtered_out=1).
 *
 * - `exclude_keywords` — case-insensitive підрядок у title + очищеному (без HTML-тегів) description.
 * - `ranges` — перше число з `params[key]`; якщо ключ відсутній або не парситься —
 *   правило до цього рядка НЕ застосовується (не дає filtered_out за цим правилом).
 */
export function evaluateFilteredOut(filters: LocalFilters, listing: FilterableListing): boolean {
  const keywords = filters.exclude_keywords ?? [];
  if (keywords.length > 0) {
    const haystack = `${listing.title ?? ''} ${stripHtml(listing.description ?? '')}`.toLowerCase();
    if (keywords.some((kw) => kw.trim() !== '' && haystack.includes(kw.toLowerCase()))) {
      return true;
    }
  }

  const ranges = filters.ranges ?? {};
  if (Object.keys(ranges).length > 0) {
    let params: Record<string, string> = {};
    try {
      params = listing.params ? (JSON.parse(listing.params) as Record<string, string>) : {};
    } catch {
      params = {};
    }

    for (const [key, range] of Object.entries(ranges)) {
      const label = params[key];
      if (label == null) continue;

      const value = extractFirstNumber(label);
      if (value === null) continue;

      if (range.min != null && value < range.min) return true;
      if (range.max != null && value > range.max) return true;
    }
  }

  return false;
}
