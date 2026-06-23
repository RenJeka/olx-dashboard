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
  /** 1 — пошук в архіві (docs/plans/archive-searches.md). */
  archived: number;
  /** Проект, до якого віднесено пошук; null — «Без проекту» (docs/plans/projects.md). */
  project_id: number | null;
  created_at: string;
}

/** Проект — група пошуків (docs/plans/projects.md). */
export interface Project {
  id: number;
  name: string;
  sort_order: number | null;
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
  /** Білий список листових category_id (точна відповідність Listing.category_id). Порожньо → вимкнено. */
  categories?: number[];
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
    categories?: boolean;
  };
}

/** Розподіл ключів params цього пошуку (з GET /api/searches/:id/param-keys) — для конструктора діапазонів. */
export interface ParamKeyInfo {
  key: string;
  samples: string[];
}

/**
 * Вузол дерева категорій OLX (facet з останнього скану).
 * `id` — category id (= Listing.category_id); `path` — назви предків root→leaf;
 * `olxCount` — лічильник OLX для запиту (включно з підкатегоріями).
 */
export interface CategoryOption {
  id: number;
  path: string[];
  olxCount: number;
}

/** Відповідь GET /api/searches/:id/filter-options — варіанти для фільтрів "Місто"/"Продавець"/"Плюси"/"Мінуси". */
export interface FilterOptions {
  cities: string[];
  sellers: string[];
  pros: string[];
  cons: string[];
  /** Листові категорії, наявні в оголошеннях пошуку, зі шляхом назв (дерево фільтра категорій). */
  categories: CategoryOption[];
}

/** Відповідь PATCH /api/searches/:id при зміні local_filters — містить лічильник перерахунку. */
export interface SearchPatchResult extends Search {
  filtered_out_count?: number;
}

export interface NewSearchInput {
  name: string;
  query: string;
  priceFrom?: number;
  priceTo?: number;
  querySynonyms?: string[];
  projectId?: number | null;
}

export interface StoredTableState {
  columnSizing: ColumnSizingState;
  sorting: SortingState;
  pageSize: number;
}
