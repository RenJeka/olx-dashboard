// Доменні типи OLX Dashboard. Без `any` у доменному ядрі (scraper/db/logic).

/** Проект — група пошуків (docs/plans/projects.md). */
export interface Project {
  id: number;
  name: string;
  sort_order: number | null;
  created_at: string;
}

/** Серверні фільтри OLX, що йдуть у URL пошуку. */
export interface ApiFilters {
  /** Числові range-фільтри: search[filter_float_<name>:from/:to]. */
  ranges?: Record<string, { from?: number; to?: number }>;
  /** Категорійні фільтри: search[filter_enum_<name>][0]. */
  enums?: Record<string, string[]>;
  /** search[private_business]=private — лише приватні продавці. */
  privateOnly?: boolean;
}

/** Локальні (нерайонні) фільтри пошуку: ціна/місто/продавець (Етап 2). */
export interface LocalFilters {
  // ── Заплановано на майбутнє (закомментовано, не видаляти) ──────────────
  // /** Case-insensitive підрядки — збіг у title+description → filtered_out=1. */
  // exclude_keywords?: string[];
  // /** Числові діапазони по значенню params[key] (перше число в label); ключ відсутній/не парситься → правило не застосовується. */
  // ranges?: Record<string, { min?: number; max?: number }>;

  /** Діапазон ціни (UAH). price IS NULL → правило не застосовується до цього рядка. */
  price_range?: { min?: number; max?: number };
  /** Білий список міст (точна відповідність listings.city). Порожньо/відсутньо → правило вимкнено. */
  cities?: string[];
  /** Білий список продавців (точна відповідність listings.seller_name). Порожньо/відсутньо → правило вимкнено. */
  sellers?: string[];
  /** Білий список критеріїв плюсів (listings.pros). Оголошення має мати хоча б один. Порожньо → вимкнено. */
  pros?: string[];
  /** Білий список критеріїв мінусів (listings.cons). Оголошення має мати хоча б один. Порожньо → вимкнено. */
  cons?: string[];
  /** Білий список листових category_id (точна відповідність listings.category_id). Порожньо → вимкнено. */
  categories?: number[];
  /**
   * Інвертований режим для кожної групи фільтрів. Відсутній ключ / false = прямий режим
   * (показувати лише збіги). true = збіги приховуються (чорний список).
   * Кожна група незалежна; комбінування між групами — AND.
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

/** Конфіг пошуку (рядок таблиці searches у зручному вигляді). */
export interface SearchConfig {
  id: number;
  name: string;
  query: string;
  categoryId?: number | null;
  apiFilters: ApiFilters;
  /** Синоніми query (docs/plans/search-synonyms.md) — скануються разом, видача зливається по olx_id. */
  querySynonyms?: string[];
}

/** Елемент відповіді GET /api/searches/:id/param-keys — для конструктора діапазонів локальних фільтрів. */
export interface ParamKeyInfo {
  key: string;
  /** До 3 прикладів значень (label) цього ключа з оголошень пошуку. */
  samples: string[];
}

/**
 * Вузол дерева категорій OLX для пошуку (facet, docs/plans/category-counts-and-filter.md).
 * `id` — category id (збігається з listings.category_id); `path` — назви предків root→leaf;
 * `olxCount` — лічильник OLX для запиту (включно з підкатегоріями, як віддає facet).
 */
export interface CategoryOption {
  id: number;
  path: string[];
  olxCount: number;
}

/** Відповідь GET /api/searches/:id/filter-options — варіанти для фільтрів "Місто"/"Продавець"/"Плюси"/"Мінуси". */
export interface FilterOptions {
  /** Унікальні непорожні listings.city цього пошуку, відсортовані. */
  cities: string[];
  /** Унікальні непорожні listings.seller_name цього пошуку, відсортовані. */
  sellers: string[];
  /** Критерії плюсів із searches.analysis_criteria для цього пошуку. */
  pros: string[];
  /** Критерії мінусів із searches.analysis_criteria для цього пошуку. */
  cons: string[];
  /** Дерево категорій OLX для пошуку (facet з останнього скану): назви + ієрархія + OLX-лічильники. */
  categories: CategoryOption[];
}
