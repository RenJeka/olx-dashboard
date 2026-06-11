import type { ColumnSizingState, SortingState } from '@tanstack/react-table';

export interface Search {
  id: number;
  name: string;
  query: string;
  api_filters: string;
  visible_total_count: number | null;
  created_at: string;
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
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
}

export interface ScanResult {
  found: number;
  new_count: number;
  requestsUsed: number;
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
