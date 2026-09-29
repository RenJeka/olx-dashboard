import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Тести НІКОЛИ не чіпають server/data/olx.db: кожен прогін — окремий тимчасовий файл libSQL
// (db.ts читає TURSO_DATABASE_URL; env.ts не перезаписує вже задані змінні). Файли тестів
// виконуються послідовно — вони ділять одну БД і чистять її в beforeEach (test/db.ts).
const testDb = join(tmpdir(), `olx-dashboard-test-${process.pid}-${Date.now()}.db`);
process.env.OLX_TEST_DB = testDb; // для прибирання в src/test/globalSetup.ts (той самий процес)

export default defineConfig({
  test: {
    globalSetup: ['src/test/globalSetup.ts'],
    include: ['src/**/*.test.ts'],
    env: { TURSO_DATABASE_URL: `file:${testDb}`, TURSO_AUTH_TOKEN: '' },
    fileParallelism: false,
  },
});
