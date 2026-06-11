// CLI-скан без UI: npm run scan -- --search <id> [--deep]
import { runScan } from './scanner.js';

function parseSearchId(argv: string[]): number | null {
  const idx = argv.indexOf('--search');
  if (idx === -1 || idx + 1 >= argv.length) return null;
  const id = Number(argv[idx + 1]);
  return Number.isFinite(id) ? id : null;
}

const argv = process.argv.slice(2);
const searchId = parseSearchId(argv);
const deep = argv.includes('--deep');

if (searchId === null) {
  console.error('Вкажи пошук: npm run scan -- --search <id> [--deep]');
  process.exit(1);
}

try {
  const result = await runScan(searchId, { deep });
  console.log(
    `Скан #${searchId} завершено: знайдено ${result.found}, нових ${result.new_count}, запитів ${result.requestsUsed}`,
  );
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Скан #${searchId} впав: ${message}`);
  process.exit(1);
}
