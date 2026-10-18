// CLI збирача дерева категорій: npm run categories:collect [-- --words "ноутбук,телефон"]
import { initDb } from './db/db.js';
import { collectCategories } from './categories/collector.js';
import { SEED_WORDS } from './categories/seedWords.js';

function parseWords(argv: string[]): string[] | null {
  const idx = argv.indexOf('--words');
  if (idx === -1) return null;
  const raw = argv[idx + 1];
  if (!raw) return [];
  return raw.split(',').map((w) => w.trim()).filter(Boolean);
}

const custom = parseWords(process.argv.slice(2));
const words = custom ?? SEED_WORDS;

if (words.length === 0) {
  console.error('Порожній список слів: npm run categories:collect -- --words "ноутбук,телефон"');
  process.exit(1);
}

try {
  for (const sql of await initDb()) console.log(`Міграція схеми: ${sql}`);
  console.log(`Збір дерева категорій: ${words.length} слів (пауза 1–2 с між запитами)`);
  const result = await collectCategories(words);
  console.log(
    `Готово: запитів ${result.requested}, нових/змінених вузлів ${result.changed}, ` +
      `невдало ${result.failed.length}${result.failed.length ? ` (${result.failed.join(', ')})` : ''}`,
  );
  // Усі слова невдалі (OLX недоступний/змінив схему) — ненульовий код для скриптів/CI.
  process.exit(result.requested > 0 && result.failed.length === result.requested ? 1 : 0);
} catch (err) {
  console.error(`Збір дерева впав: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
