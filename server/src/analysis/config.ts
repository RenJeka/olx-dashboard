// Конфіг LLM-аналізу: завантаження server/.env (без нової залежності).
// Magic-значення (моделі, ліміти, мапи) — у constants.ts.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_FILENAME } from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// server/.env (config.ts лежить у server/src/analysis → піднятись на 2 рівні до server/).
const ENV_PATH = join(__dirname, '..', '..', ENV_FILENAME);

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
