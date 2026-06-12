import type { ColumnSizingState, SortingState } from '@tanstack/react-table';

export interface Search {
  id: number;
  name: string;
  query: string;
  api_filters: string;
  local_filters: string;
  visible_total_count: number | null;
  sort_order: number;
  created_at: string;
}

/** Локальні (нерайонні) фільтри пошуку: стоп-слова й числові діапазони по params (Етап 2). */
export interface LocalFilters {
  exclude_keywords?: string[];
  ranges?: Record<string, { min?: number; max?: number }>;
}

/** Розподіл ключів params цього пошуку (з GET /api/searches/:id/param-keys) — для конструктора діапазонів. */
export interface ParamKeyInfo {
  key: string;
  samples: string[];
}

/** Відповідь PATCH /api/searches/:id при зміні local_filters — містить лічильник перерахунку. */
export interface SearchPatchResult extends Search {
  filtered_out_count?: number;
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
}

export interface Listing {
  id: number;
  olx_id: number;
  search_id: number;
  title: string | null;
  url: string | null;
  price: number | null;
  currency: string;
  city: string | null;
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
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
}

export interface ScanResult {
  found: number;
  new_count: number;
  requestsUsed: number;
  disabled_count: number;
}

/** Результат verify-проходу (POST /api/searches/:id/verify, Етап 2 A3). */
export interface VerifyResult {
  checked: number;
  alive: number;
  dead: number;
  unknown: number;
  reactivated: number;
  disabled_count: number;
  backfilled: number;
}

/** Останній запис scan_runs для пошуку — для прогрес-бару глибокого скану. */
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

/** Останній скан пошуку — частина відповіді GET /api/searches/:id/stats. */
export interface LastScanInfo {
  kind: string;
  started_at: string;
  finished_at: string | null;
  found: number | null;
  new_count: number | null;
  disabled_count: number | null;
  error: string | null;
}

/** Відповідь GET /api/searches/:id/stats — для панелі дій. */
export interface SearchStats {
  in_db: number;
  /** status_source='auto' AND last_seen_at старше 3 днів — для картки «Зниклі/Старі». */
  stale_count: number;
  /** Кандидати verify-проходу (A3): давно не бачені + рядки без опису, без перетину. */
  verify_candidates: number;
  last_scan: LastScanInfo | null;
}

export interface NewSearchInput {
  name: string;
  query: string;
  priceFrom?: number;
  priceTo?: number;
}

export interface StoredTableState {
  columnSizing: ColumnSizingState;
  sorting: SortingState;
  pageSize: number;
}
