import { rmSync } from 'node:fs';

/** Після прогону — прибрати тимчасовий файл БД тестів (і його -wal/-shm). */
export default function setup(): () => void {
  return () => {
    const file = process.env.OLX_TEST_DB;
    if (!file || !file.includes('olx-dashboard-test-')) return;
    for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });
  };
}
