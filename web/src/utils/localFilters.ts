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
