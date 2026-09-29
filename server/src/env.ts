// Завантаження server/.env у process.env ДО ініціалізації клієнта БД: db.ts читає
// TURSO_DATABASE_URL на рівні модуля (createClient). Side-effect модуль — імпортувати
// ПЕРШИМ у db.ts (і в точках входу). process.loadEnvFile (Node 20.12+/22) не перетирає
// вже наявні змінні; відсутній файл — не помилка (локальний дефолт у db.ts + ручний LLM-режим).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// env.ts лежить у server/src → піднятись на 1 рівень до server/ (.env лишається поза dist).
const ENV_PATH = join(__dirname, '..', '.env');

try {
  process.loadEnvFile(ENV_PATH);
} catch {
  // .env відсутній або недоступний — працюємо на локальному дефолті (file:) і в ручному режимі.
}
