// Єдине джерело magic-значень фронтенду (ключі сховища, дефолти, константи LLM-аналізу).

// ── localStorage: ключі та дефолти ──────────────────────────────────────────
export const SETTINGS_STORAGE_KEY = 'olx-ui-settings-v1';
export const TABLE_STORAGE_KEY = 'olx-listings-table-v1';
export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_AUTO_REFRESH_INTERVAL_MIN = 30;
export const DEFAULT_ANALYSIS_MODEL = 'google/gemini-2.5-flash-lite';

// ── LLM-аналіз: майстер ──────────────────────────────────────────────────────
/** Кроки степера майстра. */
export const ANALYSIS_STEPS = ['Критерії', 'Пошук', 'Перевірка', 'Вставка'];
/** Розмір батчу запису результату в БД (chunked commit). */
export const COMMIT_CHUNK = 50;
/** Розмір батчу id за один виклик /analyze (дзеркалить MAX_ANALYZE_IDS сервера). */
export const ANALYZE_CHUNK = 200;
/** Підпис режиму (мінуси/плюси). */
export const MODE_LABELS: Record<'cons' | 'pros', string> = { cons: 'Мінуси', pros: 'Плюси' };
/** Джерело аналізу при commit (listings.analysis_source). */
export const ANALYSIS_SOURCE = { API: 'api', IMPORT: 'import' } as const;
/** Позначка моделі для ручного імпорту. */
export const MANUAL_MODEL = 'manual';

// ── AI Вибір (ранжування) ──────────────────────────────────────────────────────
/** Підпис псевдо-вкладки/scope «Найкращі кандидати» (ai_picks) — спільний для таблиці й майстра. */
export const AI_PICKS_LABEL = 'Найкращі кандидати';
/** Скільки кандидатів (без мінусів) максимум іде в промпт (дзеркалить PICK_CANDIDATES_LIMIT сервера). */
export const PICK_CANDIDATES_LIMIT = 500;
/** Скільки найкращих кандидатів LLM повертає (дзеркалить PICK_TOP_N сервера). */
export const PICK_TOP_N = 30;
/** Понад скільки кандидатів ручний режим перемикається з одного промпту на ZIP-пакет (дзеркалить MANUAL_PICKS_ZIP_CHUNK_SIZE сервера). */
export const MANUAL_PICKS_ZIP_CHUNK_SIZE = 50;

// ── Підсвітка (HighlightText) ─────────────────────────────────────────────────
/** Мін. довжина одиночного запиту-фільтра для підсвітки. */
export const HIGHLIGHT_SINGLE_MIN_LENGTH = 1;
/** Мін. довжина фрагмента evidence у мульти-підсвітці (захист від шуму). */
export const HIGHLIGHT_MULTI_MIN_LENGTH = 3;
