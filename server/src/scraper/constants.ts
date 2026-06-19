/**
 * Спільні константи скраперів OLX (GraphQL + HTML fetcher + scanner).
 * Раніше дублювались у graphqlOlxFetcher.ts, olxFetcher.ts, scanner.ts.
 */

/** Розмір батчу запитів — ліміт звичайного скану і крок паузи у глибокому. */
export const BATCH_SIZE = 3;

/** Абсолютний запобіжник для глибокого скану (на випадок аномального visible_total_count). */
export const DEEP_SAFETY_CAP = 50;

// ── Затримки ввічливості (між запитами / між батчами) ────────────────────────

/** Мінімальна затримка між окремими запитами (мс). */
export const MIN_DELAY_MS = 1000;
/** Максимальна затримка між окремими запитами (мс). */
export const MAX_DELAY_MS = 2000;

/** Мінімальна пауза між батчами у глибокому скані (мс). */
export const BATCH_PAUSE_MIN_MS = 3000;
/** Максимальна пауза між батчами у глибокому скані (мс). */
export const BATCH_PAUSE_MAX_MS = 6000;

// ── HTTP ─────────────────────────────────────────────────────────────────────

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
