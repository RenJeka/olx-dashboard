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
  category_id: number | null;
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
 * Кожна група фільтрів має два режими (керується `filters.invert.<group>`):
 * - **прямий** (false / відсутній): показувати лише збіги (білий список).
 * - **інвертований** (true): збіги приховувати (чорний список).
 *
 * Групи:
 * - `price_range` — `listing.price` поза/в межах min/max; `price IS NULL` → правило не застосовується.
 * - `cities` — список міст (точна відповідність listing.city).
 * - `sellers` — список продавців (точна відповідність listing.seller_name).
 * - `pros` — список критеріїв плюсів; оголошення має мати хоча б один.
 * - `cons` — список критеріїв мінусів; оголошення має мати хоча б один.
 *
 * Між групами — AND: повернути true, якщо будь-яке правило спрацювало.
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

  const invert = filters.invert ?? {};

  // ── Ціна ──────────────────────────────────────────────────────────────────
  const priceRange = filters.price_range;
  if (priceRange && listing.price != null) {
    const within =
      (priceRange.min == null || listing.price >= priceRange.min) &&
      (priceRange.max == null || listing.price <= priceRange.max);
    if (invert.price_range ? within : !within) return true;
  }

  // ── Міста ─────────────────────────────────────────────────────────────────
  const cities = filters.cities ?? [];
  if (cities.length > 0) {
    const inList = listing.city != null && cities.includes(listing.city);
    if (invert.cities ? inList : !inList) return true;
  }

  // ── Продавці ──────────────────────────────────────────────────────────────
  const sellers = filters.sellers ?? [];
  if (sellers.length > 0) {
    const inList = listing.seller_name != null && sellers.includes(listing.seller_name);
    if (invert.sellers ? inList : !inList) return true;
  }

  // ── Плюси ─────────────────────────────────────────────────────────────────
  const filterPros = filters.pros ?? [];
  if (filterPros.length > 0) {
    const hasAny = parseBullets(listing.pros).some((p) => filterPros.includes(p));
    if (invert.pros ? hasAny : !hasAny) return true;
  }

  // ── Мінуси ────────────────────────────────────────────────────────────────
  const filterCons = filters.cons ?? [];
  if (filterCons.length > 0) {
    const hasAny = parseBullets(listing.cons).some((c) => filterCons.includes(c));
    if (invert.cons ? hasAny : !hasAny) return true;
  }

  // ── Категорії ─────────────────────────────────────────────────────────────
  const categories = filters.categories ?? [];
  if (categories.length > 0) {
    const inList = listing.category_id != null && categories.includes(listing.category_id);
    if (invert.categories ? inList : !inList) return true;
  }

  return false;
}
