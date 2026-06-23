import type { LocalFilters, Listing } from '../types';

/** Парсить JSON `searches.local_filters` у типізовану структуру (порожньо при помилці парсингу). */
export function parseLocalFilters(raw: string): LocalFilters {
  try {
    return JSON.parse(raw || '{}') as LocalFilters;
  } catch {
    return {};
  }
}

/** Пункти з bullet-тексту «• a\n• b» → ['a','b'] (для оцінки фільтрів плюсів/мінусів). */
function parseBullets(text: string | null): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.replace(/^[•\-\s]+/, '').trim())
    .filter(Boolean);
}

/** Прямий режим ховає невідповідні; інвертований — відповідні; вимкнена група нічого не ховає. */
function hides(active: boolean, matched: boolean, inverted?: boolean): boolean {
  return active && (inverted ? matched : !matched);
}

/**
 * Дзеркало серверного `evaluateFilteredOut` (server/src/scraper/localFilters.ts) для ЖИВОГО
 * прев'ю в Drawer — чи рядок буде прихований локальними фільтрами. Тримати синхронним із сервером.
 * Активні групи: ціна / міста / продавці / плюси / мінуси / категорії (кожна з режимом invert).
 */
export function evaluateLocalFilters(f: LocalFilters, l: Listing): boolean {
  const invert = f.invert ?? {};

  const pr = f.price_range;
  if (pr && l.price != null) {
    const within = (pr.min == null || l.price >= pr.min) && (pr.max == null || l.price <= pr.max);
    if (hides(true, within, invert.price_range)) return true;
  }

  const cities = f.cities ?? [];
  if (hides(cities.length > 0, l.city != null && cities.includes(l.city), invert.cities)) return true;

  const sellers = f.sellers ?? [];
  if (hides(sellers.length > 0, l.seller_name != null && sellers.includes(l.seller_name), invert.sellers))
    return true;

  const pros = f.pros ?? [];
  if (hides(pros.length > 0, parseBullets(l.pros).some((p) => pros.includes(p)), invert.pros)) return true;

  const cons = f.cons ?? [];
  if (hides(cons.length > 0, parseBullets(l.cons).some((c) => cons.includes(c)), invert.cons)) return true;

  const cats = f.categories ?? [];
  if (hides(cats.length > 0, l.category_id != null && cats.includes(l.category_id), invert.categories))
    return true;

  return false;
}

/** Чи має пошук активні локальні фільтри (індикатор-крапка у рядку пошуку). */
export function hasActiveLocalFilters(raw: string): boolean {
  const f = parseLocalFilters(raw);
  return (
    f.price_range?.min != null ||
    f.price_range?.max != null ||
    (Array.isArray(f.cities) && f.cities.length > 0) ||
    (Array.isArray(f.sellers) && f.sellers.length > 0) ||
    (Array.isArray(f.pros) && f.pros.length > 0) ||
    (Array.isArray(f.cons) && f.cons.length > 0) ||
    (Array.isArray(f.categories) && f.categories.length > 0)
  );
}

export interface LocalFiltersFormState {
  priceMin: string;
  priceMax: string;
  cities: string[];
  sellers: string[];
  pros: string[];
  cons: string[];
  categories: number[];
  priceInvert: boolean;
  citiesInvert: boolean;
  sellersInvert: boolean;
  prosInvert: boolean;
  consInvert: boolean;
  categoriesInvert: boolean;
}

/** 
 * Конвертує плоский стан форми з Drawer-а у компактний об'єкт `LocalFilters`
 * готовий для відправки на бекенд. Порожні масиви та неактивні інверсії відкидаються.
 */
export function buildLocalFiltersPayload(state: LocalFiltersFormState): LocalFilters {
  const local_filters: LocalFilters = {};

  const priceRange: { min?: number; max?: number } = {};
  if (state.priceMin.trim() !== '') priceRange.min = Number(state.priceMin);
  if (state.priceMax.trim() !== '') priceRange.max = Number(state.priceMax);
  if (priceRange.min !== undefined || priceRange.max !== undefined) {
    local_filters.price_range = priceRange;
  }

  if (state.cities.length > 0) local_filters.cities = state.cities;
  if (state.sellers.length > 0) local_filters.sellers = state.sellers;
  if (state.pros.length > 0) local_filters.pros = state.pros;
  if (state.cons.length > 0) local_filters.cons = state.cons;
  if (state.categories.length > 0) local_filters.categories = state.categories;

  // Зберігаємо invert лише для груп, де є значення і прапорець true
  const invert: LocalFilters['invert'] = {};
  if (local_filters.price_range && state.priceInvert) invert.price_range = true;
  if (local_filters.cities && state.citiesInvert) invert.cities = true;
  if (local_filters.sellers && state.sellersInvert) invert.sellers = true;
  if (local_filters.pros && state.prosInvert) invert.pros = true;
  if (local_filters.cons && state.consInvert) invert.cons = true;
  if (local_filters.categories && state.categoriesInvert) invert.categories = true;
  if (Object.keys(invert).length > 0) local_filters.invert = invert;

  return local_filters;
}
