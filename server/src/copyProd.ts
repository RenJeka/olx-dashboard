// CLI: копія прод-БД (Turso) у локальний server/data/olx.db — docs/plans/old/db-copy-prod.md.
// Запуск: npm run db:copy-prod (змінні PROD_DB_URL / PROD_DB_TOKEN — у сесії PowerShell людини).
// Свідомо НЕ імпортує db/db.ts: той відкрив би olx.db (libSQL на Windows тримає файл до виходу з
// процесу) і читав би TURSO_* — окремі імена змінних не дають `npm run dev` у тому ж вікні піти в прод.
import { createClient } from '@libsql/client';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDatabase } from './db/copyDb.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TARGET = join(DATA_DIR, 'olx.db');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const url = process.env.PROD_DB_URL?.trim();
const token = process.env.PROD_DB_TOKEN?.trim();
if (!url || !token) {
  fail(
    'Не задано PROD_DB_URL і/або PROD_DB_TOKEN. У PowerShell цього вікна:\n' +
      "  $env:PROD_DB_URL = 'libsql://<база>.turso.io'\n" +
      "  $env:PROD_DB_TOKEN = '<токен лише для читання>'",
  );
}
if (!/^(libsql|https):\/\//.test(url)) fail('PROD_DB_URL має бути адресою Turso (libsql://… або https://…).');

const devRunning = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(1500) }).then(
  () => true,
  () => false,
);
if (devRunning) fail('Працює локальний сервер (:3001) і тримає olx.db — зупиніть npm run dev (Ctrl+C) і повторіть.');
if (existsSync(`${TARGET}-wal`) || existsSync(`${TARGET}-shm`)) {
  fail(`Поряд з ${TARGET} є -wal/-shm — БД відкрита іншим процесом. Зупиніть його й повторіть.`);
}

mkdirSync(DATA_DIR, { recursive: true });
let backup: string | null = null;
if (existsSync(TARGET)) {
  backup = join(DATA_DIR, `olx-bak-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  try {
    renameSync(TARGET, backup);
  } catch (err) {
    fail(`olx.db зайнятий (${(err as Error).message}) — зупиніть процеси, що його відкрили, і повторіть.`);
  }
  console.log(`Попередня локальна БД → ${backup}`);
}

const source = createClient({ url, authToken: token, intMode: 'bigint' });
const target = createClient({ url: `file:${TARGET}`, intMode: 'bigint' });

try {
  console.log('Копіюю (з проду лише SELECT)…');
  const tables = await copyDatabase(source, target, (table, rows) => process.stdout.write(`\r  ${table}: ${rows}`));
  process.stdout.write('\n');
  console.log('\nГотово. Рядків по таблицях:');
  for (const t of tables) console.log(`  ${t.table}: ${t.rows}`);
  console.log(`\nФайл: ${TARGET}`);
} catch (err) {
  process.stdout.write('\n');
  console.error(`Копіювання впало: ${(err as Error).message}`);
  console.error(`${TARGET} — неповний.`);
  if (backup) console.error(`Повернути попередню БД: Move-Item -Force "${backup}" "${TARGET}"`);
  process.exitCode = 1;
} finally {
  source.close();
  target.close();
}

console.log('Закрийте це вікно PowerShell (або Remove-Item Env:PROD_DB_URL, Env:PROD_DB_TOKEN), потім npm run dev.');
