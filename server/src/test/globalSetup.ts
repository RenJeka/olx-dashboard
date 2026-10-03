import { readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIX = 'olx-dashboard-test-';

/** Видалити файл; на Windows він буває ще зайнятий (`EBUSY`) — повтори, далі лише попередження. */
function removeQuietly(path: string): void {
  try {
    rmSync(path, { force: true, maxRetries: 10, retryDelay: 100 });
  } catch (err) {
    console.warn(`Тимчасову БД тестів не прибрано: ${(err as Error).message}`);
  }
}

/**
 * Тимчасова БД тестів (vitest.config.ts → OLX_TEST_DB). На старті — прибрати залишки попередніх
 * прогонів (одиночний прогін на Windows не встигає звільнити файл), після прогону — свій файл
 * (і його -wal/-shm). Збій прибирання не валить прогін.
 */
export default function setup(): () => void {
  const file = process.env.OLX_TEST_DB;
  for (const name of readdirSync(tmpdir())) {
    const path = join(tmpdir(), name);
    if (name.startsWith(PREFIX) && !path.startsWith(file ?? '\0')) removeQuietly(path);
  }
  return () => {
    if (!file || !file.includes(PREFIX)) return;
    for (const suffix of ['', '-wal', '-shm']) removeQuietly(file + suffix);
  };
}
