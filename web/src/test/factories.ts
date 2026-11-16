// Фабрики тестових даних фронтенду (docs/development.md §7): типові значення + лише ті поля, що важливі тесту.
// Тести беруть дані тільки звідси — зміна типу лагодиться в одному місці.
import type {
  AnalyzedListing,
  AnalyzeResponse,
  CategoryOption,
  Listing,
  MatchedItem,
  OlxCategoryItem,
  PickItem,
  PickResult,
  RelevanceItem,
  RelevanceResponse,
  Search,
} from '../types';
import type { LocalFiltersFormState } from '../utils/localFilters';

/** Момент, від якого рахуються дати в типових даних. */
export const BASE_TIME = '2026-06-10T08:00:00.000Z';

let nextId = 1;
const takeId = (given?: number): number => given ?? nextId++;

/** Оголошення: нове, активне, не відфільтроване, без AI-вердикту, плюсів і мінусів. */
export function makeListing(fields: Partial<Listing> = {}): Listing {
  const id = takeId(fields.id);
  return {
    id,
    olx_id: 900_000 + id,
    search_id: 1,
    title: `Оголошення ${id}`,
    url: `https://www.olx.ua/d/uk/obyavlenie/item-${id}.html`,
    price: 10_000,
    currency: 'UAH',
    city: 'Київ',
    category_id: 37,
    category_type: 'electronics',
    photo_url: null,
    description_preview: null,
    has_description: false,
    seller_name: 'Продавець',
    contact_name: null,
    olx_status: 'active',
    status: 'new',
    status_source: 'auto',
    note: '',
    pros: '',
    cons: '',
    filtered_out: 0,
    miss_count: 0,
    analysis_at: null,
    analysis_source: null,
    analysis_model: null,
    analysis_stale: 0,
    posted_at: BASE_TIME,
    first_seen_at: BASE_TIME,
    last_seen_at: BASE_TIME,
    ai_rank: null,
    ai_pick_reason: null,
    ai_ranked_at: null,
    ai_relevant: null,
    ai_relevant_reason: null,
    ai_relevant_at: null,
    ai_relevant_source: null,
    ...fields,
  };
}

/** Пошук: без фільтрів, синонімів і проєкту, не в архіві. */
export function makeSearch(fields: Partial<Search> = {}): Search {
  const id = takeId(fields.id);
  return {
    id,
    name: `Пошук ${id}`,
    query: 'iphone 13',
    api_filters: '{}',
    local_filters: '{}',
    visible_total_count: null,
    sort_order: id,
    query_synonyms: '[]',
    archived: 0,
    project_id: null,
    created_at: BASE_TIME,
    ...fields,
  };
}

// ── Результати AI ────────────────────────────────────────────────────────────

/** Вердикт фільтра релевантності для одного оголошення. */
export function makeRelevanceItem(fields: Partial<RelevanceItem> = {}): RelevanceItem {
  return { id: takeId(fields.id), relevant: true, reason: 'відповідає запиту', ...fields };
}

export function makeRelevanceResponse(fields: Partial<RelevanceResponse> = {}): RelevanceResponse {
  return { results: [makeRelevanceItem()], errors: [], ...fields };
}

/** Знайдений пункт (мінус чи плюс) із підтвердженою цитатою. */
export function makeMatchedItem(fields: Partial<MatchedItem> = {}): MatchedItem {
  return { criterion: 'тріснутий екран', evidence: 'екран тріснутий', ok: true, ...fields };
}

export function makeAnalyzedListing(fields: Partial<AnalyzedListing> = {}): AnalyzedListing {
  return { id: takeId(fields.id), items: [makeMatchedItem()], ...fields };
}

export function makeAnalyzeResponse(fields: Partial<AnalyzeResponse> = {}): AnalyzeResponse {
  return { results: [makeAnalyzedListing()], errors: [], ...fields };
}

/** Позиція «AI Вибору». */
export function makePickItem(fields: Partial<PickItem> = {}): PickItem {
  return { id: takeId(fields.id), rank: 1, reason: 'найкраща ціна', ...fields };
}

export function makePickResult(fields: Partial<PickResult> = {}): PickResult {
  return { picks: [makePickItem()], summary: 'Підсумок вибору', ...fields };
}

// ── Категорії ────────────────────────────────────────────────────────────────

/** Категорія з facet останнього скану (дерево фільтра «Категорії»). */
export function makeCategoryOption(fields: Partial<CategoryOption> = {}): CategoryOption {
  const id = takeId(fields.id);
  return { id, path: [`Категорія ${id}`], olxCount: 10, ...fields };
}

/** Вузол дерева категорій OLX (вікно «Базові плюси й мінуси»): корінь без набору. */
export function makeOlxCategory(fields: Partial<OlxCategoryItem> = {}): OlxCategoryItem {
  const id = takeId(fields.id);
  return { id, parentId: null, label: `Категорія ${id}`, slug: `category-${id}`, hasSet: false, ...fields };
}

// ── Форма локальних фільтрів ─────────────────────────────────────────────────

/** Порожня форма шухляди «Локальні фільтри». */
export function makeFiltersForm(fields: Partial<LocalFiltersFormState> = {}): LocalFiltersFormState {
  return {
    priceMin: '',
    priceMax: '',
    cities: [],
    sellers: [],
    pros: [],
    cons: [],
    categories: [],
    priceInvert: false,
    citiesInvert: false,
    sellersInvert: false,
    prosInvert: false,
    consInvert: false,
    categoriesInvert: false,
    ...fields,
  };
}

// ── Попередження скану ───────────────────────────────────────────────────────

/** Фрагменти `scan_runs.warning` — дзеркало текстів сервера (перелік — у шапці utils/scanWarning.ts). */
export const SCAN_WARNING_PARTS = {
  multiQuery: (variants: number) => `multi-query: ${variants} варіантів запиту змерджено`,
  unionCoverageSkipped: 'вікно покриття пропущено (union кількох видач)',
  split: (variant: string, buckets: number) => `«${variant}»: split: ${buckets} price buckets; coverage window skipped`,
  capHit: 'some buckets hit pagination/request cap',
  windowCap: 'graphql window cap hit at offset=1000',
  noPriceBound: 'split skipped: no upper price bound',
  htmlFallback: 'graphql failed: 403; fallback html OK',
} as const;

/** Попередження скану з фрагментів — так само, як їх зчіплює сервер. */
export function makeScanWarning(...parts: string[]): string {
  return parts.join('; ');
}
