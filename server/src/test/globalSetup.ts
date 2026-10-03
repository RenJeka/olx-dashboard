import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIX = 'olx-dashboard-test-';
/** Залишок, старший за це, — точно не БД паралельного прогону, що ще йде. */
const LEFTOVER_MIN_AGE_MS = 60 * 60 * 1000;

/** Видалити файл; на Windows він буває ще зайнятий (`EBUSY`) — повтори, далі лише попередження. */
function removeQuietly(path: string): void {
  try {
    rmSync(path, { force: true, maxRetries: 10, retryDelay: 100 });
  } catch (err) {
    console.warn(`Тимчасову БД тестів не прибрано: ${(err as Error).message}`);
  }
}

/**
 * Тимчасова БД тестів (vitest.config.ts → OLX_TEST_DB). На старті — прибрати старі залишки
 * попередніх прогонів (одиночний прогін на Windows не встигає звільнити файл; свіжі не чіпаємо —
 * це може бути паралельний прогін), після прогону — свій файл (і його -wal/-shm). Збій прибирання
 * не валить прогін.
 */
export default function setup(): () => void {
  const file = process.env.OLX_TEST_DB;
  for (const name of readdirSync(tmpdir())) {
    const path = join(tmpdir(), name);
    if (!name.startsWith(PREFIX) || (file && path.startsWith(file))) continue;
    try {
      if (Date.now() - statSync(path).mtimeMs > LEFTOVER_MIN_AGE_MS) removeQuietly(path);
    } catch {
      // файл зник між readdir і stat — прибирати нічого
    }
  }
  return () => {
    if (!file || !file.includes(PREFIX)) return;
    for (const suffix of ['', '-wal', '-shm']) removeQuietly(file + suffix);
  };
}
