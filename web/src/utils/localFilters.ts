import type { LocalFilters } from '../types';

/** Парсить JSON `searches.local_filters` у типізовану структуру (порожньо при помилці парсингу). */
export function parseLocalFilters(raw: string): LocalFilters {
  try {
    return JSON.parse(raw || '{}') as LocalFilters;
  } catch {
    return {};
  }
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
    (Array.isArray(f.cons) && f.cons.length > 0)
  );
}

export interface LocalFiltersFormState {
  priceMin: string;
  priceMax: string;
  cities: string[];
  sellers: string[];
  pros: string[];
  cons: string[];
  priceInvert: boolean;
  citiesInvert: boolean;
  sellersInvert: boolean;
  prosInvert: boolean;
  consInvert: boolean;
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

  // Зберігаємо invert лише для груп, де є значення і прапорець true
  const invert: LocalFilters['invert'] = {};
  if (local_filters.price_range && state.priceInvert) invert.price_range = true;
  if (local_filters.cities && state.citiesInvert) invert.cities = true;
  if (local_filters.sellers && state.sellersInvert) invert.sellers = true;
  if (local_filters.pros && state.prosInvert) invert.pros = true;
  if (local_filters.cons && state.consInvert) invert.cons = true;
  if (Object.keys(invert).length > 0) local_filters.invert = invert;

  return local_filters;
}
