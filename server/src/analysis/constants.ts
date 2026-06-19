// Єдине джерело magic-значень LLM-аналізу (числа, рядки, мапи). Тут — лише дані/конфіг;
// логіка завантаження .env лишається в config.ts, промпт-прози — у prompts.ts.
import type { AnalysisMode } from '../types.js';

// ── Модель / OpenRouter ──────────────────────────────────────────────────────
/** Дефолтна модель (редагована у налаштуваннях фронтенду, передається в тілі запиту). */
export const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Заголовки атрибуції OpenRouter (HTTP-Referer / X-Title). */
export const OPENROUTER_REFERER = 'http://localhost:5173';
export const OPENROUTER_TITLE = 'OLX Dashboard';
/** Скільки спроб робить chat() (1 ретрай на невалідному JSON/мережевій помилці). */
export const OPENROUTER_MAX_ATTEMPTS = 2;
/** Обрізання тексту HTTP-помилки OpenRouter у повідомленні. */
export const OPENROUTER_ERROR_DETAIL_MAX_CHARS = 300;
/** Примус JSON-відповіді. */
export const OPENROUTER_RESPONSE_FORMAT = { type: 'json_object' } as const;
/** Імʼя файлу .env (у корені server/). */
export const ENV_FILENAME = '.env';

// ── Чанкування / ліміти ──────────────────────────────────────────────────────
/** Авто-режим: дрібні батчі (модель деградує на довгому контексті). */
export const AUTO_CHUNK_SIZE = 12;
/**
 * Пре-фільтр релевантності: максимальна відстань (у словах) між згадкою бренду й номера
 * моделі, за якої оголошення ще вважається кандидатом. «iPhone 5» (поруч) → кандидат;
 * «iPhone 8 … батарея 5%» (далеко) → відсіюється.
 */
export const RELEVANCE_PROXIMITY_WINDOW = 4;
/** Максимум id за один виклик /analyze (далі фронт повторює). */
export const MAX_ANALYZE_IDS = 200;
/** Скільки оголошень кладеться в один файл `descriptions/chunk-NNN.json` ZIP-пакета. */
export const MANUAL_ZIP_CHUNK_SIZE = 50;
/** Ліміт критеріїв (узгоджено з промптом). */
export const MAX_CRITERIA = 50;
/** Ліміт синонімів пошукового запиту (docs/plans/search-synonyms.md, узгоджено з промптом). */
export const MAX_SYNONYMS = 15;
/** Розмір семпла описів для генерації критеріїв. */
export const DEFAULT_SAMPLE_SIZE = 30;
/** AI Вибір: скільки кандидатів (без мінусів) максимум кладеться в LLM-промпт. */
export const PICK_CANDIDATES_LIMIT = 500;
/** AI Вибір: скільки найкращих кандидатів LLM має повернути (топ-N замість 3-5). */
export const PICK_TOP_N = 30;
/** AI Вибір (ручний ZIP): скільки кандидатів кладеться в один файл candidates/chunk-NNN.json. */
export const MANUAL_PICKS_ZIP_CHUNK_SIZE = 50;
/** AI Вибір (ручний ZIP): скільки номінантів максимум LLM лишає з одного чанку (етап 1 map-reduce). */
export const PICKS_NOMINEES_PER_CHUNK = 10;

// ── Семпл / промпт ────────────────────────────────────────────────────────────
/** Обрізання опису у промпті генерації критеріїв. */
export const CRITERIA_DESC_SLICE = 800;
/** Обрізання опису у промпті matching. */
export const MATCHING_DESC_SLICE = 1500;
/** Скільки значень params підставляти в промпт. */
export const MAX_PARAMS_IN_PROMPT = 12;
/** Стеля внеску довжини опису у скор семплера. */
export const SAMPLE_SCORE_LENGTH_CAP = 1500;
/** Вага одного «сигнального» токена у скорі семплера. */
export const SAMPLE_SIGNAL_TOKEN_WEIGHT = 300;

// ── Верифікація ──────────────────────────────────────────────────────────────
/** Мінімальна довжина evidence для substring-перевірки (захист від шуму). */
export const EVIDENCE_MIN_LENGTH = 3;

// ── Запис / формат / експорт ───────────────────────────────────────────────────
/** Префікс пункту у TEXT-полях pros/cons. */
export const BULLET_PREFIX = '• ';
/** Джерело аналізу (listings.analysis_source). */
export const ANALYSIS_SOURCE = { API: 'api', IMPORT: 'import' } as const;
/** Позначка моделі для ручного імпорту (listings.analysis_model). */
export const MANUAL_MODEL = 'manual';
/** Відступ JSON-експорту превʼю. */
export const JSON_EXPORT_INDENT = 2;
export const MIME_JSON = 'application/json';
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MIME_ZIP = 'application/zip';
/** Ширини колонок Excel-експорту превʼю. */
export const PREVIEW_XLSX_WIDTHS = { title: 40, description: 60, criteria: 40 } as const;

// ── Типи / guard ────────────────────────────────────────────────────────────────
export function isMode(value: unknown): value is AnalysisMode {
  return value === 'cons' || value === 'pros';
}

// ── Мапи режиму ────────────────────────────────────────────────────────────────
/** Підпис режиму (заголовок колонки/файлу). */
export const MODE_LABEL: Record<AnalysisMode, string> = { cons: 'Мінуси', pros: 'Плюси' };
/** Іменник режиму для промптів. */
export const MODE_NOUN: Record<AnalysisMode, string> = {
  cons: 'мінуси (недоліки) товару',
  pros: 'плюси (переваги) товару',
};

// ── Доменні дані промптів ────────────────────────────────────────────────────
/** Базовий каркас критеріїв — зашитий, LLM доповнює специфічними для категорії. */
export const BASE_SCAFFOLD: Record<AnalysisMode, string[]> = {
  cons: [
    'без торгу',
  ],
  pros: [
    'можливий торг',
  ],
};

/** «Сигнальні» токени — описи з ними інформативніші для генерації критеріїв. */
export const SIGNAL_TOKENS = [
  'стан',
  'ремонт',
  'запчастини',
  'не працює',
  'дефект',
  'торг',
  'гарант',
  'комплект',
  'документ',
  'новий',
  'подряпин',
  'тріщин',
];

// ── Повідомлення про помилки (повторювані в routes/analysis.ts) ────────────────
export const ANALYSIS_ERRORS = {
  SEARCH_NOT_FOUND: 'Пошук не знайдено',
  BAD_MODE: 'mode має бути cons|pros',
  NO_API_KEY: 'Авто-режим недоступний: немає OPENROUTER_API_KEY',
  NO_CRITERIA: 'Спершу збережіть критерії пошуку',
  EMPTY_RESPONSE: 'Порожня відповідь',
} as const;
