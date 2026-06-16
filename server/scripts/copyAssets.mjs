// Копіює не-TS асети у dist після tsc (tsc копіює лише .ts → .js).
// Потрібно для прод-запуску `node dist/index.js`: модулі читають ці файли з диску
// відносно власного розташування (як db.ts читає schema.sql, routes/analysis.ts — analyze.py).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ASSETS = [
  ['src/db/schema.sql', 'dist/db/schema.sql'],
  ['src/analysis/analyze.py', 'dist/analysis/analyze.py'],
];

for (const [from, to] of ASSETS) {
  const dest = join(root, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(root, from), dest);
}
