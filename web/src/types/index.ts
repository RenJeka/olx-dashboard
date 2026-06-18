import type { ColumnSizingState, SortingState } from '@tanstack/react-table';

export interface Search {
  id: number;
  name: string;
  query: string;
  api_filters: string;
  local_filters: string;
  visible_total_count: number | null;
  sort_order: number;
  /** JSON-масив альтернативних пошукових запитів (синоніми query, docs/plans/search-synonyms.md). */
  query_synonyms: string;
  created_at: string;
}

/** Локальні (нерайонні) фільтри пошуку: ціна/місто/продавець (Етап 2). */
export interface LocalFilters {
  // ── Заплановано на майбутнє (закомментовано, не видаляти) ──────────────
  // exclude_keywords?: string[];
  // ranges?: Record<string, { min?: number; max?: number }>;

  /** Діапазон ціни (UAH). price = null у оголошення → правило не застосовується. */
  price_range?: { min?: number; max?: number };
  /** Білий список міст (точна відповідність Listing.city). */
  cities?: string[];
  /** Білий список продавців (точна відповідність Listing.seller_name). */
  sellers?: string[];
  /** Білий список критеріїв плюсів. Оголошення має мати хоча б один. Порожньо → вимкнено. */
  pros?: string[];
  /** Білий список критеріїв мінусів. Оголошення має мати хоча б один. Порожньо → вимкнено. */
  cons?: string[];
  /**
   * Інвертований режим для кожної групи фільтрів. Відсутній ключ / false = прямий режим.
   * true = збіги приховуються (чорний список). Кожна група незалежна.
   */
  invert?: {
    price_range?: boolean;
    cities?: boolean;
    sellers?: boolean;
    pros?: boolean;
    cons?: boolean;
  };
}

/** Розподіл ключів params цього пошуку (з GET /api/searches/:id/param-keys) — для конструктора діапазонів. */
export interface ParamKeyInfo {
  key: string;
  samples: string[];
}

/** Відповідь GET /api/searches/:id/filter-options — варіанти для фільтрів "Місто"/"Продавець"/"Плюси"/"Мінуси". */
export interface FilterOptions {
  cities: string[];
  sellers: string[];
  pros: string[];
  cons: string[];
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
  /** Ручний override семантичного фільтра: 1=релевантне, 0=нерелевантне, null=скинути. */
  ai_relevant?: number | null;
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

// ── Семантичний фільтр релевантності (docs/plans/semantic-relevance-filter.md) ──

export interface RelevanceItem {
  id: number;
  relevant: boolean;
  reason: string;
}

export interface RelevanceResponse {
  results: RelevanceItem[];
  errors: string[];
}

// ── AI Вибір позицій (план docs/plans/AI-auto-top.md) ────────────────────────

export interface PickItem {
  id: number;
  rank: number;
  reason: string;
}

export interface PickResult {
  picks: PickItem[];
  summary: string;
}

// ── LLM-аналіз (план docs/plans/llm-analysis.md) ─────────────────────────────

export type AnalysisMode = 'cons' | 'pros';

export interface AnalysisStatus {
  apiAvailable: boolean;
  defaultModel: string;
}

export interface AnalysisCriteria {
  cons: string[];
  pros: string[];
}

export interface MatchedItem {
  criterion: string;
  evidence: string;
  ok: boolean;
}

export interface AnalyzedListing {
  id: number;
  items: MatchedItem[];
}

export interface AnalyzeResponse {
  results: AnalyzedListing[];
  errors: string[];
}

export interface PackagePart {
  name: string;
  content: string;
}

export interface CommitItem {
  id: number;
  criteria: string[];
}

export interface ScanResult {
  found: number;
  new_count: number;
  requestsUsed: number;
  disabled_count: number;
  /** Кількість цінових бакетів глибокого скану з авто-розбиттям (>1 — діапазон ділився). */
  bucketsUsed?: number;
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
  fetch_method: string | null;
  kind: string | null;
  /** Людиномовний поточний етап (docs/plans/scan-progress-detail.md), напр. «Синонім «X» (2/4)». */
  stage: string | null;
  /** Позиція в підпослідовності (1-based): варіант синоніма / ціновий бакет / фаза verify. */
  sub_done: number | null;
  /** Загальна кількість підпослідовності — керує сегментованою смугою прогресу. */
  sub_total: number | null;
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
  querySynonyms?: string[];
}

export interface StoredTableState {
  columnSizing: ColumnSizingState;
  sorting: SortingState;
  pageSize: number;
}
