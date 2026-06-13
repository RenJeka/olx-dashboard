// Конфіг LLM-аналізу: завантаження server/.env (без нової залежності) + константи.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// server/.env (config.ts лежить у server/src/analysis → піднятись на 2 рівні до server/).
const ENV_PATH = join(__dirname, '..', '..', '.env');

// Міні-лоадер: process.loadEnvFile (Node 20.12+/22) читає server/.env, не перетираючи
// вже наявні process.env. Відсутній файл — не помилка (ключ опціональний).
try {
  process.loadEnvFile(ENV_PATH);
} catch {
  // .env відсутній або недоступний — працюємо в повністю ручному режимі.
}

/** Чи доступний авто-режим (є ключ OpenRouter). */
export function hasApiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function getApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY ?? null;
}

/** Дефолтна модель (редагована у налаштуваннях фронтенду, передається в тілі запиту). */
export const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

/** Авто-режим: дрібні батчі (модель деградує на довгому контексті). */
export const AUTO_CHUNK_SIZE = 12;

/** Максимум id за один виклик /analyze (далі фронт повторює). */
export const MAX_ANALYZE_IDS = 200;

/** Поріг токенів ручного пакета: ≤ — один файл, інакше — кілька частин. */
export const MANUAL_PACKAGE_TOKEN_CAP = 12000;

/** Ліміт критеріїв (узгоджено з промптом). */
export const MAX_CRITERIA = 50;

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
