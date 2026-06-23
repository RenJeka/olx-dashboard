import type { RawListing } from './listings.js';
import type { SearchConfig } from './core.js';

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
