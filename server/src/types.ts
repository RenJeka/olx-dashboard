// Доменні типи OLX Monitor. Без `any` у доменному ядрі (scraper/db/logic).

/** Серверні фільтри OLX, що йдуть у URL пошуку. */
export interface ApiFilters {
  /** Числові range-фільтри: search[filter_float_<name>:from/:to]. */
  ranges?: Record<string, { from?: number; to?: number }>;
  /** Категорійні фільтри: search[filter_enum_<name>][0]. */
  enums?: Record<string, string[]>;
  /** search[private_business]=private — лише приватні продавці. */
  privateOnly?: boolean;
}

/** Конфіг пошуку (рядок таблиці searches у зручному вигляді). */
export interface SearchConfig {
  id: number;
  name: string;
  query: string;
  categoryId?: number | null;
  apiFilters: ApiFilters;
}

/** Сире оголошення зі сторінки пошуку (до нормалізації). */
export interface RawListing {
  olxId: number;
  title: string;
  /** Сирий рядок ціни, напр. "6 000 грн.". */
  rawPrice: string;
  /** Абсолютний URL оголошення. */
  url: string;
  photoUrl?: string;
  /** Сирий текст блоку дата/локація, напр. "Київ - Сьогодні о 12:00". */
  locationDate?: string;

  // Структуровані поля з GraphQL (HTML-фетчер їх не заповнює; normalizer
  // віддає їм пріоритет, якщо присутні — див. server/src/scraper/normalizer.ts).
  /** Ціна числом; null — якщо OLX не показує ціну (напр. "Договірна"). */
  price?: number | null;
  currency?: string;
  /** ISO дата створення оголошення. */
  createdAt?: string;
  /** ISO дата останнього оновлення оголошення. */
  lastRefreshAt?: string;
  city?: string;
  district?: string;
  sellerType?: 'private' | 'business';
  /** Плаский обʼєкт характеристик (без ціни): { key: label }. */
  params?: Record<string, string>;
  /** Повний HTML-опис з <br /> тегами (GraphQL: data[].description). */
  description?: string;
  /** Імʼя/назва продавця (GraphQL: data[].user.name). */
  sellerName?: string;
  /** Імʼя контактної особи (GraphQL: data[].contact.name). */
  contactName?: string;
  /** Статус оголошення на OLX, напр. "active" (GraphQL: data[].status). НЕ плутати з listings.status. */
  olxStatus?: string;
}

/** Нормалізована ціна. */
export interface NormalizedPrice {
  price: number | null;
  currency: string;
}

/** Результат сканування (повертається з /scan та CLI). */
export interface ScanResult {
  found: number;
  new_count: number;
}

/** Рядок listings для віддачі у API/UI. */
export interface ListingRow {
  id: number;
  olx_id: number;
  search_id: number;
  title: string | null;
  url: string | null;
  price: number | null;
  currency: string;
  city: string | null;
  district: string | null;
  photo_url: string | null;
  description: string | null;
  seller_name: string | null;
  contact_name: string | null;
  olx_status: string | null;
  status: string;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
}

/** Результат fetchSearch: список оголошень + метадані видачі (якщо доступні). */
export interface FetchSearchResult {
  listings: RawListing[];
  /** metadata.visible_total_count з GraphQL; null — якщо недоступне (HTML-фетчер або відсутнє у відповіді). */
  visibleTotalCount: number | null;
}

/**
 * Інтерфейс збирача OLX. Ізолює стратегію збору (HTML → __NEXT_DATA__ → Playwright)
 * від решти системи.
 */
export interface OlxFetcher {
  fetchSearch(search: SearchConfig): Promise<FetchSearchResult>;
}
