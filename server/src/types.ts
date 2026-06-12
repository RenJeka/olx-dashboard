// Доменні типи OLX Dashboard. Без `any` у доменному ядрі (scraper/db/logic).

/** Серверні фільтри OLX, що йдуть у URL пошуку. */
export interface ApiFilters {
  /** Числові range-фільтри: search[filter_float_<name>:from/:to]. */
  ranges?: Record<string, { from?: number; to?: number }>;
  /** Категорійні фільтри: search[filter_enum_<name>][0]. */
  enums?: Record<string, string[]>;
  /** search[private_business]=private — лише приватні продавці. */
  privateOnly?: boolean;
}

/** Локальні (нерайонні) фільтри пошуку: стоп-слова й числові діапазони по params (Етап 2). */
export interface LocalFilters {
  /** Case-insensitive підрядки — збіг у title+description → filtered_out=1. */
  exclude_keywords?: string[];
  /** Числові діапазони по значенню params[key] (перше число в label); ключ відсутній/не парситься → правило не застосовується. */
  ranges?: Record<string, { min?: number; max?: number }>;
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
  /** Скільки HTTP-запитів реально зроблено (звичайний скан: ≤3, глибокий: до DEEP_SAFETY_CAP). */
  requestsUsed: number;
  /** Скільки оголошень переведено в disabled через statusEngine (лише GraphQL-скани). */
  disabled_count: number;
}

/** Останній запис scan_runs для пошуку — для ендпойнту прогресу глибокого скану. */
export interface ScanStatus {
  id: number;
  started_at: string;
  finished_at: string | null;
  found: number | null;
  new_count: number | null;
  error: string | null;
  requests_done: number | null;
  requests_total: number | null;
}

/** Статус оголошення в моніторингу (ручний/auto-цикл, Етап 2). */
export type ListingStatus = 'new' | 'interested' | 'contacted' | 'rejected' | 'disabled';

export const LISTING_STATUSES: ListingStatus[] = [
  'new',
  'interested',
  'contacted',
  'rejected',
  'disabled',
];

/** Тіло PATCH /api/listings/:id. */
export interface ListingPatch {
  status?: ListingStatus;
  note?: string;
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
  status_source: string;
  note: string;
  filtered_out: number;
  miss_count: number;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
}

/** Елемент відповіді GET /api/searches/:id/param-keys — для конструктора діапазонів локальних фільтрів. */
export interface ParamKeyInfo {
  key: string;
  /** До 3 прикладів значень (label) цього ключа з оголошень пошуку. */
  samples: string[];
}

/** Останній рядок scan_runs — частина відповіді GET /api/searches/:id/stats. */
export interface LastScanInfo {
  kind: string;
  started_at: string;
  finished_at: string | null;
  found: number | null;
  new_count: number | null;
  disabled_count: number | null;
  error: string | null;
}

/** Відповідь GET /api/searches/:id/stats — для панелі дій (Етап 2). */
export interface SearchStats {
  in_db: number;
  /** Кандидати verify: status_source='auto' AND last_seen_at старше 3 днів. */
  stale_count: number;
  last_scan: LastScanInfo | null;
}

/** Результат fetchSearch: список оголошень + метадані видачі (якщо доступні). */
export interface FetchSearchResult {
  listings: RawListing[];
  /** metadata.visible_total_count з GraphQL; null — якщо недоступне (HTML-фетчер або відсутнє у відповіді). */
  visibleTotalCount: number | null;
  /** Скільки запитів/сторінок реально оброблено. */
  requestsUsed: number;
  /**
   * Остання отримана сторінка мала < PAGE_LIMIT елементів (видачу вичерпано раніше
   * лімітів скану) → вікно покриття statusEngine = вся видача (windowFloor = null).
   * Для HtmlOlxFetcher завжди false (statusEngine для fallback-сканів не викликається).
   */
  exhausted: boolean;
}

/** Опції одного скану. */
export interface FetchOptions {
  /**
   * Глибокий скан: батчі по BATCH_SIZE запитів з паузою BATCH_PAUSE_MIN_MS..BATCH_PAUSE_MAX_MS
   * між батчами, ціль — min(DEEP_SAFETY_CAP, ceil(visible_total_count / PAGE_LIMIT)) запитів.
   * За замовчуванням (false/відсутнє) — звичайний скан, ≤BATCH_SIZE запитів.
   */
  deep?: boolean;
  /** Викликається після кожного запиту/сторінки: (done, total). */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Інтерфейс збирача OLX. Ізолює стратегію збору (HTML → __NEXT_DATA__ → Playwright)
 * від решти системи.
 */
export interface OlxFetcher {
  fetchSearch(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult>;
}
