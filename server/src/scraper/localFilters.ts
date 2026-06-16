import type { LocalFilters } from '../types.js';
import { parseBullets } from '../analysis/text.js';

/** Поля оголошення, потрібні для оцінки локальних фільтрів. */
export interface FilterableListing {
  title: string | null;
  description: string | null;
  params: string | null;
  price: number | null;
  city: string | null;
  seller_name: string | null;
  pros: string | null;
  cons: string | null;
}

// ── Заплановано на майбутнє (закомментовано, не видаляти) ──────────────────
// const HTML_TAG_RE = /<[^>]*>/g;
// const FIRST_NUMBER_RE = /\d+(?:[.,]\d+)?/;
//
// function stripHtml(html: string): string {
//   return html.replace(HTML_TAG_RE, ' ');
// }
//
// /** parseFloat першого числа в рядку (кома як десятковий роздільник); немає числа → null. */
// function extractFirstNumber(label: string): number | null {
//   const match = label.match(FIRST_NUMBER_RE);
//   if (!match) return null;
//   const value = Number(match[0].replace(',', '.'));
//   return Number.isNaN(value) ? null : value;
// }

/**
 * Оцінює, чи оголошення підпадає під локальні фільтри пошуку (filtered_out=1).
 *
 * - `price_range` — `listing.price` поза межами min/max → filtered_out; `price IS NULL` → правило не застосовується.
 * - `cities` — білий список; якщо непорожній і `listing.city` відсутній або не в списку → filtered_out.
 * - `sellers` — білий список; якщо непорожній і `listing.seller_name` відсутній або не в списку → filtered_out.
 * - `pros` — білий список критеріїв; якщо непорожній і жоден з обраних критеріїв не присутній у `listing.pros` → filtered_out.
 * - `cons` — білий список критеріїв; якщо непорожній і жоден з обраних критеріїв не присутній у `listing.cons` → filtered_out.
 */
export function evaluateFilteredOut(filters: LocalFilters, listing: FilterableListing): boolean {
  // ── Заплановано на майбутнє (закомментовано, не видаляти) ────────────────
  // const keywords = filters.exclude_keywords ?? [];
  // if (keywords.length > 0) {
  //   const haystack = `${listing.title ?? ''} ${stripHtml(listing.description ?? '')}`.toLowerCase();
  //   if (keywords.some((kw) => kw.trim() !== '' && haystack.includes(kw.toLowerCase()))) {
  //     return true;
  //   }
  // }
  //
  // const ranges = filters.ranges ?? {};
  // if (Object.keys(ranges).length > 0) {
  //   let params: Record<string, string> = {};
  //   try {
  //     params = listing.params ? (JSON.parse(listing.params) as Record<string, string>) : {};
  //   } catch {
  //     params = {};
  //   }
  //
  //   for (const [key, range] of Object.entries(ranges)) {
  //     const label = params[key];
  //     if (label == null) continue;
  //
  //     const value = extractFirstNumber(label);
  //     if (value === null) continue;
  //
  //     if (range.min != null && value < range.min) return true;
  //     if (range.max != null && value > range.max) return true;
  //   }
  // }

  const priceRange = filters.price_range;
  if (priceRange && listing.price != null) {
    if (priceRange.min != null && listing.price < priceRange.min) return true;
    if (priceRange.max != null && listing.price > priceRange.max) return true;
  }

  const cities = filters.cities ?? [];
  if (cities.length > 0) {
    if (listing.city == null || !cities.includes(listing.city)) return true;
  }

  const sellers = filters.sellers ?? [];
  if (sellers.length > 0) {
    if (listing.seller_name == null || !sellers.includes(listing.seller_name)) return true;
  }

  const filterPros = filters.pros ?? [];
  if (filterPros.length > 0) {
    const listingPros = parseBullets(listing.pros);
    if (!listingPros.some((p) => filterPros.includes(p))) return true;
  }

  const filterCons = filters.cons ?? [];
  if (filterCons.length > 0) {
    const listingCons = parseBullets(listing.cons);
    if (!listingCons.some((c) => filterCons.includes(c))) return true;
  }

  return false;
}
