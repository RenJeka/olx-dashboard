// CLI-скан без UI: npm run scan -- --search <id> [--deep|--verify]
import { runScan, runVerify } from './scanner/index.js';

function parseSearchId(argv: string[]): number | null {
  const idx = argv.indexOf('--search');
  if (idx === -1 || idx + 1 >= argv.length) return null;
  const id = Number(argv[idx + 1]);
  return Number.isFinite(id) ? id : null;
}

const argv = process.argv.slice(2);
const searchId = parseSearchId(argv);
const deep = argv.includes('--deep');
const verify = argv.includes('--verify');

if (searchId === null) {
  console.error('Вкажи пошук: npm run scan -- --search <id> [--deep|--verify]');
  process.exit(1);
}

if (deep && verify) {
  console.error('--deep і --verify взаємовиключні');
  process.exit(1);
}

try {
  if (verify) {
    const result = await runVerify(searchId);
    console.log(
      `Verify #${searchId} завершено: перевірено ${result.checked}, живих ${result.alive}, ` +
        `мертвих ${result.dead}, невідомо ${result.unknown}, реактивовано ${result.reactivated}, ` +
        `вимкнено ${result.disabled_count}, дозаповнено ${result.backfilled}`,
    );
  } else {
    const result = await runScan(searchId, { deep });
    console.log(
      `Скан #${searchId} завершено: знайдено ${result.found}, нових ${result.new_count}, ` +
        `вимкнено ${result.disabled_count}, запитів ${result.requestsUsed}`,
    );
  }
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Скан #${searchId} впав: ${message}`);
  process.exit(1);
}
