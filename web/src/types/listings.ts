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
  /** Ручний override «Активності» (разова підказка): 'active'|'inactive'|'removed' або null. */
  olx_status?: string | null;
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
  /** OLX category.id (числовий id листової категорії); назву резолвить словник на бекенді. NULL до re-scan. */
  category_id: number | null;
  /** OLX category.type (слаг верхнього рівня). NULL до re-scan. */
  category_type: string | null;
  photo_url: string | null;
  /** JSON-масив прев'ю-лінків усіх фото (галерея, docs/plans/photo-gallery.md). NULL до re-scan. */
  photo_urls: string | null;
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
