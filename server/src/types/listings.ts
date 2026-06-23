/** Сире оголошення зі сторінки пошуку (до нормалізації). */
export interface RawListing {
  olxId: number;
  title: string;
  /** Сирий рядок ціни, напр. "6 000 грн.". */
  rawPrice: string;
  /** Абсолютний URL оголошення. */
  url: string;
  photoUrl?: string;
  /** Прев'ю-лінки всіх фото оголошення (галерея, GraphQL: photos[].link). */
  photoUrls?: string[];
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
  /** OLX category.id (числовий id листової категорії); назву резолвимо словником olxCategories.ts. */
  categoryId?: number | null;
  /** OLX category.type (слаг верхнього рівня, напр. "electronics"). */
  categoryType?: string | null;
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
  pros?: string;
  cons?: string;
  /** Ручний override семантичного фільтра: 1=релевантне, 0=нерелевантне, null=скинути. */
  ai_relevant?: number | null;
  /**
   * Ручний override «Активності» (olx_status). Разова підказка БЕЗ захисту: наступний
   * GraphQL-скан/verify, що побачить оголошення, перепише реальним значенням від OLX.
   * Дозволено: 'active'|'inactive'|'removed' або null («невідоме»).
   */
  olx_status?: string | null;
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
  pros: string;
  cons: string;
  filtered_out: number;
  miss_count: number;
  analysis_at: string | null;
  analysis_source: string | null;
  analysis_model: string | null;
  analysis_stale: number;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
  ai_rank: number | null;
  ai_pick_reason: string | null;
  ai_ranked_at: string | null;
  ai_relevant: number | null;
  ai_relevant_reason: string | null;
  ai_relevant_at: string | null;
  ai_relevant_source: string | null;
}
