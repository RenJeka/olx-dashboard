export interface ScanResult {
  /** Унікальних оголошень (після дедупу по olx_id між синонімами/бакетами). */
  found: number;
  new_count: number;
  /** Сирих оголошень до cross-variant дедупу; `rawFound - found` = злито дублів між синонімами. */
  rawFound?: number;
  requestsUsed: number;
  disabled_count: number;
  /** Кількість цінових бакетів глибокого скану з авто-розбиттям (>1 — діапазон ділився). */
  bucketsUsed?: number;
  /** Скан зупинено користувачем — збережено частковий результат. */
  stopped?: boolean;
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
  /** Сирих оголошень до дедупу між синонімами (NULL для старих сканів). */
  raw_found: number | null;
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
  /** Сирих оголошень до дедупу між синонімами (NULL для старих сканів). */
  raw_found: number | null;
  disabled_count: number | null;
  /** Реальний збій скану (обидві стратегії впали). */
  error: string | null;
  /** Попередження часткового успіху (скан вдався, але з застереженням) — не помилка. */
  warning: string | null;
}

/**
 * Відповідь сервера GET /api/searches/:id/stats — лише `last_scan` (1 рядок scan_runs).
 * Дзеркало server `LastScanResponse`. Агрегати рахуються на клієнті (`computeListingStats`),
 * docs/plans/turso-stats-clientside.md.
 */
export interface LastScanResponse {
  last_scan: LastScanInfo | null;
}

/**
 * Статистика пошуку для панелі дій — збирається на КЛІЄНТІ: `in_db`/`stale_count`/
 * `verify_candidates` з масиву listings (`computeListingStats`), `last_scan` зі звуженого `/stats`.
 */
export interface SearchStats {
  in_db: number;
  /** status_source='auto' AND last_seen_at старше 3 днів — для картки «Зниклі/Старі». */
  stale_count: number;
  /** Кандидати verify-проходу (A3): давно не бачені + рядки без опису, без перетину. */
  verify_candidates: number;
  last_scan: LastScanInfo | null;
}

// ── Двофазний глибокий скан: аналіз → звіт → підтверджений запуск ───────────
// (docs/plans/two-phase-deep-scan.md). Дзеркало DTO server/src/types.ts.

/** Підсумок одного цінового бакету split-скану — для стрічки «ціновий спектр» у звіті. */
export interface PriceBucketSummary {
  from: number;
  to: number | null;
  count: number;
}

/** Підсумок аналітичної фази для одного варіанта запиту (основний query або синонім). */
export interface ScanPlanQuery {
  query: string;
  rootCount: number | null;
  buckets: PriceBucketSummary[];
  noSplit: boolean;
  fallbackReason?: string;
  remainingRequests: number;
  /** Внесок варіанта в унікальні: скільки olxId його вибірки нові щодо попередніх варіантів. */
  sampleUnique: number | null;
}

/** Звіт аналітичної фази глибокого скану (POST /scan/analyze) — дані для ScanPlanReportDialog. */
export interface ScanPlan {
  /** Токен для POST /scan/run-plan; план кешується на сервері (TTL), повторний probe не потрібен. */
  planToken: string;
  perQuery: ScanPlanQuery[];
  totalListings: number;
  totalBuckets: number;
  remainingRequests: number;
  estimatedDurationSec: number;
  /** Оцінка нових (відсутніх у БД) оголошень за семплом 0-х сторінок бакетів; null — немає семпла. */
  estimatedNew: number | null;
  /** true — estimatedNew рахується лише за першими сторінками бакетів, не повною видачею. */
  estimatedNewIsSample: boolean;
  /** Оцінка УНІКАЛЬНИХ оголошень після дедупу між синонімами; null — немає вибірки. */
  estimatedUnique: number | null;
  /** raw_found останнього завершеного нормального скану (сирих до дедупу); null — сканів не було. */
  lastScanRaw: number | null;
  /** found останнього завершеного нормального скану (унікальних після дедупу); null — сканів не було. */
  lastScanUnique: number | null;
  /**
   * visible_total_count головного query БЕЗ фільтрів ціни — «скільки всього на OLX» для чесного
   * порівняння з відфільтрованими числами звіту. null — фільтра ціни немає або probe не вдався.
   */
  unfilteredTotal: number | null;
  /** >1 варіант (синоніми) або є split — вікно покриття пропускається при повному скані. */
  partial: boolean;
  warnings: string[];
}

/**
 * Останній збережений аналіз (GET /api/searches/:id/last-analysis,
 * docs/plans/deep-scan-stop-and-history.md). `planValid` — часова валідність (у межах TTL 30 хв
 * за `finished_at`): true → звіт ще запускний (сервер за потреби перезондує); false →
 * протермінований, потрібен новий аналіз.
 */
export interface LastAnalysis {
  plan: ScanPlan;
  analyzedAt: string | null;
  planValid: boolean;
}
