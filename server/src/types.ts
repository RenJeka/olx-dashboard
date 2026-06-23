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

/** Результат verify-проходу (повертається з /verify та CLI, Етап 2 A3). */
export interface VerifyResult {
  /** Скільки сторінок оголошень перевірено. */
  checked: number;
  alive: number;
  dead: number;
  /** Невизначений вердикт (JS-only сторінка, мережева помилка, неочікуваний код) — статус не змінено. */
  unknown: number;
  /** auto-disabled оголошення, що повернулись у 'new' після підтвердження живості. */
  reactivated: number;
  /** Скільки оголошень переведено в disabled (вердикт dead, auto/rejected). */
  disabled_count: number;
  /** Скільки рядків отримали description/seller_name, яких раніше не було (NULL → значення). */
  backfilled: number;
}

/** Результат сканування (повертається з /scan та CLI). */
export interface ScanResult {
  /** Унікальних оголошень (після дедупу по olxId між синонімами/бакетами) — записано в БД. */
  found: number;
  new_count: number;
  /**
   * Сирих оголошень до cross-variant дедупу (сума по варіантах синонімів/бакетах).
   * `rawFound - found` = скільки дублів злито між синонімами (docs/plans/deep-scan-stop-and-history.md).
   * Для скану без синонімів дорівнює `found`.
   */
  rawFound?: number;
  /** Скільки HTTP-запитів реально зроблено (звичайний скан: ≤3, глибокий: до DEEP_SAFETY_CAP). */
  requestsUsed: number;
  /** Скільки оголошень переведено в disabled через statusEngine (лише GraphQL-скани). */
  disabled_count: number;
  /** Скільки цінових бакетів використав глибокий скан із авто-розбиттям (>1 — було розбиття). */
  bucketsUsed?: number;
  /** Скан зупинено користувачем — у БД збережено частковий результат (вікно покриття пропущено). */
  stopped?: boolean;
}

/** Останній запис scan_runs для пошуку — для ендпойнту прогресу глибокого скану. */
export interface ScanStatus {
  id: number;
  started_at: string;
  finished_at: string | null;
  found: number | null;
  new_count: number | null;
  /** Сирих оголошень до дедупу між синонімами (NULL для старих сканів). */
  raw_found: number | null;
  error: string | null;
  requests_done: number | null;
  requests_total: number | null;
  fetch_method: string | null;
  /** normal | deep | verify. */
  kind: string | null;
  /** Людиномовний поточний етап (docs/plans/scan-progress-detail.md), напр. «Синонім «X» (2/4)». */
  stage: string | null;
  /** Позиція в підпослідовності (1-based): варіант синоніма / ціновий бакет / фаза verify. */
  sub_done: number | null;
  /** Загальна кількість підпослідовності — керує сегментованою смугою прогресу. */
  sub_total: number | null;
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

// ── Семантичний фільтр релевантності (план docs/plans/semantic-relevance-filter.md) ──

/** Вердикт релевантності одного оголошення (повертає LLM, парситься сервером). */
export interface RelevanceItem {
  id: number;
  /** true — лот продає цільовий товар; false — аксесуар/запчастина/згадка/«куплю». */
  relevant: boolean;
  /** Коротке пояснення вердикту. */
  reason: string;
}

/** Відповідь relevance-ендпойнтів (auto + manual import). */
export interface RelevanceResponse {
  results: RelevanceItem[];
  errors: string[];
}

// ── AI Вибір позицій (план docs/plans/AI-auto-top.md) ────────────────────────

/** Кандидат для AI-ранжування (без PII продавця). */
export interface PickCandidate {
  id: number;
  title: string | null;
  price: number | null;
  city: string | null;
  params: string | null;
  description: string | null;
  pros: string;
}

/** Один обраний AI елемент. */
export interface PickItem {
  id: number;
  rank: number;
  reason: string;
}

/** Відповідь AI-ранжування. */
export interface PickResult {
  picks: PickItem[];
  summary: string;
}

// ── LLM-аналіз (план docs/plans/llm-analysis.md) ─────────────────────────────

/** Режим аналізу: мінуси чи плюси. Критерії й промпти різні, механіка однакова. */
export type AnalysisMode = 'cons' | 'pros';

/** Критерії аналізу на рівні пошуку (searches.analysis_criteria, JSON). */
export interface AnalysisCriteria {
  cons: string[];
  pros: string[];
}

/** Один знайдений збіг критерію в оголошенні (повертає LLM + прапорець верифікації). */
export interface MatchedItem {
  /** Нормалізований критерій з обраного списку. */
  criterion: string;
  /** Дослівний фрагмент опису (для верифікації/підсвітки); у БД НЕ зберігається. */
  evidence: string;
  /** evidence підтверджено як підрядок опису (анти-галюцинація). */
  ok: boolean;
}

/** Результат аналізу одного оголошення (для кроку «Перевірка»). */
export interface AnalyzedListing {
  id: number;
  items: MatchedItem[];
}

/** Відповідь matching-ендпойнтів (auto + manual import). */
export interface AnalyzeResponse {
  results: AnalyzedListing[];
  errors: string[];
}

/** Один елемент запису в БД (commit). */
export interface CommitItem {
  id: number;
  criteria: string[];
}

/** Частина пакета для ручного режиму (один файл/чат). */
export interface PackagePart {
  name: string;
  content: string;
}

/** Елемент відповіді GET /api/searches/:id/param-keys — для конструктора діапазонів локальних фільтрів. */
export interface ParamKeyInfo {
  key: string;
  /** До 3 прикладів значень (label) цього ключа з оголошень пошуку. */
  samples: string[];
}

/**
 * Категорія, наявна у пошуку (для дерева фільтра категорій).
 * `id` — листовий listings.category_id; `path` — назви предків зверху вниз
 * (зі словника OLX; якщо словник недоступний — один сегмент із id/слагом як fallback).
 */
export interface CategoryOption {
  id: number;
  path: string[];
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
  /** Листові категорії, наявні в оголошеннях пошуку, зі шляхом назв (дерево фільтра категорій). */
  categories: CategoryOption[];
}

/** Останній рядок scan_runs — частина відповіді GET /api/searches/:id/stats. */
export interface LastScanInfo {
  kind: string;
  started_at: string;
  finished_at: string | null;
  found: number | null;
  new_count: number | null;
  /** Сирих оголошень до дедупу між синонімами (NULL для старих сканів). */
  raw_found: number | null;
  disabled_count: number | null;
  /** Реальний збій скану (обидві стратегії впали). */
  error: string | null;
  /** Попередження часткового успіху (скан вдався, але з застереженням) — не помилка. */
  warning: string | null;
}

/** Відповідь GET /api/searches/:id/stats — для панелі дій (Етап 2). */
export interface SearchStats {
  in_db: number;
  /** status_source='auto' AND last_seen_at старше 3 днів — для картки «Зниклі/Старі». */
  stale_count: number;
  /** Кандидати verify-проходу (A3): давно не бачені (P1) + рядки без опису (P2), без перетину. */
  verify_candidates: number;
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
  /**
   * Незначна проблема при успішному скані (напр. GraphqlOlxFetcher вперся у вікно
   * пагінації OLX і повернув частковий результат) — пишеться у scan_runs.error поряд
   * з фактичною помилкою/fallback-нотою.
   */
  warning?: string;
  /**
   * Кількість цінових бакетів у глибокому скані з авто-розбиттям (`fetchSearchSplit`).
   * `1`/відсутнє — розбиття не було (звичайний deep). `>1` — діапазон ділився на під-діапазони.
   */
  bucketsUsed?: number;
  /**
   * Скан перервано через `FetchOptions.shouldAbort` (кнопка «Зупинити») — `listings`
   * містить частково зібране, яке все одно треба зберегти (docs/plans/deep-scan-stop-and-history.md).
   */
  aborted?: boolean;
}

/**
 * Знімок прогресу скану (docs/plans/scan-progress-detail.md). `total` відсутній під час
 * indeterminate-фаз (зондування/бісекція deep-split) — UI показує «Підготовка…». `stage` —
 * короткий людиномовний опис поточної дії (транзієнтний текст, перезаписується щотику,
 * у т.ч. під час пауз). `subDone`/`subTotal` — позиція в реальній підпослідовності роботи
 * (варіант синоніма / ціновий бакет / фаза verify P1↔P2) для сегментованої смуги прогресу;
 * відсутні під час пауз (writer на бекенді зберігає попереднє значення через COALESCE).
 */
export interface ScanProgress {
  done: number;
  total?: number;
  method?: string;
  stage?: string;
  subDone?: number;
  subTotal?: number;
}

/** Опції одного скану. */
export interface FetchOptions {
  /**
   * Глибокий скан: батчі по BATCH_SIZE запитів з паузою BATCH_PAUSE_MIN_MS..BATCH_PAUSE_MAX_MS
   * між батчами, ціль — min(DEEP_SAFETY_CAP, ceil(visible_total_count / PAGE_LIMIT)) запитів.
   * За замовчуванням (false/відсутнє) — звичайний скан, ≤BATCH_SIZE запитів.
   */
  deep?: boolean;
  /** Викликається після кожного запиту/сторінки (і на ключових проміжних етапах). */
  onProgress?: (progress: ScanProgress) => void;
  /**
   * Опитується фетчером перед кожним запитом/ітерацією. `true` → припинити збір і повернути
   * вже зібране з `aborted: true` (кнопка «Зупинити», docs/plans/deep-scan-stop-and-history.md).
   */
  shouldAbort?: () => boolean;
}

/**
 * Інтерфейс збирача OLX. Ізолює стратегію збору (HTML → __NEXT_DATA__ → Playwright)
 * від решти системи.
 */
export interface OlxFetcher {
  fetchSearch(search: SearchConfig, options?: FetchOptions): Promise<FetchSearchResult>;
}

// ── Двофазний глибокий скан: аналіз → звіт → підтверджений запуск ───────────
// (docs/plans/two-phase-deep-scan.md). DTO для фронта — без важких page0/RawListing[],
// лише підсумки для звіту.

/** Підсумок одного цінового бакету split-скану — для стрічки «ціновий спектр» у звіті. */
export interface PriceBucketSummary {
  from: number;
  to: number | null;
  count: number;
}

/** Підсумок аналітичної фази для одного варіанта запиту (основний query або синонім). */
export interface ScanPlanQuery {
  query: string;
  /** visible_total_count кореневого запиту цього варіанта; null — якщо OLX не повернув метадані. */
  rootCount: number | null;
  buckets: PriceBucketSummary[];
  /** Розбиття не було (малий пошук) або неможливе (немає верхньої межі ціни). */
  noSplit: boolean;
  /** Чому noSplit=true без природньої малості — показується у звіті як попередження. */
  fallbackReason?: string;
  /** Скільки запитів допагінації лишилось для цього варіанта (без уже витрачених на аналіз). */
  remainingRequests: number;
  /**
   * Внесок варіанта в унікальні: скільки olxId його вибірки (0-ті сторінки) ще НЕ зустрічались
   * у вибірках попередніх варіантів. Видно, які синоніми реально тягнуть, а які дублюють.
   * null — вибірки не було (провал аналізу).
   */
  sampleUnique: number | null;
}

/** Звіт аналітичної фази глибокого скану — DTO для ScanPlanReportDialog. */
export interface ScanPlan {
  /** Токен для POST /scan/run-plan; план кешується на сервері (TTL), повторний probe не потрібен. */
  planToken: string;
  perQuery: ScanPlanQuery[];
  /** Сума rootCount по всіх варіантах (грубо — може містити дублікати між синонімами). */
  totalListings: number;
  totalBuckets: number;
  /** Сума remainingRequests по всіх варіантах — скільки запитів лишилось до повного скану. */
  remainingRequests: number;
  /** Оцінка тривалості повного скану (remainingRequests × секунд/запит, з урахуванням пауз батчів). */
  estimatedDurationSec: number;
  /** Оцінка нових (відсутніх у БД) оголошень за семплом 0-х сторінок бакетів; null — немає семпла. */
  estimatedNew: number | null;
  /** true — estimatedNew рахується лише за першими сторінками бакетів, не повною видачею. */
  estimatedNewIsSample: boolean;
  /**
   * Оцінка УНІКАЛЬНИХ оголошень після дедупу між синонімами (`totalListings × overlapRatio`,
   * де overlapRatio = union/sum розмірів вибірок). Overlap у семплі — нижня межа реального
   * перетину, тож це радше верхня оцінка унікальних. null — немає вибірки.
   */
  estimatedUnique: number | null;
  /** raw_found останнього завершеного нормального скану (сирих до дедупу); null — сканів не було. */
  lastScanRaw: number | null;
  /** found останнього завершеного нормального скану (унікальних після дедупу); null — сканів не було. */
  lastScanUnique: number | null;
  /**
   * visible_total_count головного query БЕЗ фільтрів ціни — «скільки всього на OLX» для чесного
   * порівняння з відфільтрованими числами звіту (пояснює розрив «у звіті менше, ніж на сайті»).
   * null — фільтра ціни немає (тоді числа й так невідфільтровані) або probe не вдався.
   */
  unfilteredTotal: number | null;
  /** >1 варіант (синоніми) або є split — вікно покриття пропускається при повному скані. */
  partial: boolean;
  warnings: string[];
}
