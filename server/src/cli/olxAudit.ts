// CLI аудиту запитів до OLX: npm run olx:audit [-- --query "iphone"] [-- --update]
// Живі запити до OLX (4 шт., паузи як у звичайному скані). Процедура — docs/instructions/olx-api-audit.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_PROBE_LABELS,
  hasDiff,
  runOlxAudit,
  type AuditEtalon,
  type AuditRow,
} from '../scraper/audit.js';

const ETALON_PATH = fileURLToPath(new URL('../scraper/olxAuditEtalon.json', import.meta.url));
const DEFAULT_QUERY = 'iphone';

function argValue(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  return idx === -1 ? null : (argv[idx + 1] ?? null);
}

function loadEtalon(): AuditEtalon {
  try {
    return JSON.parse(readFileSync(ETALON_PATH, 'utf8')) as AuditEtalon;
  } catch {
    return {};
  }
}

function verdict(row: AuditRow): string {
  if (row.diff === null) return '— немає еталону';
  if (!hasDiff(row.diff)) return '✅ збігається';
  const parts: string[] = [];
  if (row.diff.statusChanged) parts.push('статус');
  if (row.diff.typeChanged) parts.push('тип');
  if (row.diff.missing.length) parts.push(`зникло полів: ${row.diff.missing.length}`);
  if (row.diff.added.length) parts.push(`нових полів: ${row.diff.added.length}`);
  return `❌ ${parts.join(', ')}`;
}

function printReport(rows: AuditRow[], etalon: AuditEtalon): void {
  console.log('\n| Запит | HTTP (еталон) | Тип | Структура |');
  console.log('| --- | --- | --- | --- |');
  for (const row of rows) {
    const base = etalon[row.id];
    const status = `${row.live.status ?? 'помилка'}${base ? ` (${base.status ?? 'помилка'})` : ''}`;
    console.log(`| ${AUDIT_PROBE_LABELS[row.id]} | ${status} | ${row.live.contentType ?? '—'} | ${verdict(row)} |`);
  }
  for (const row of rows) {
    if (row.error) console.log(`\n${AUDIT_PROBE_LABELS[row.id]}: ${row.error}`);
    if (!row.diff || !hasDiff(row.diff)) continue;
    console.log(`\n${AUDIT_PROBE_LABELS[row.id]} — ${row.url}`);
    for (const path of row.diff.missing) console.log(`  − ${path}`);
    for (const path of row.diff.added) console.log(`  + ${path}`);
  }
}

const argv = process.argv.slice(2);
const update = argv.includes('--update');
const query = argValue(argv, '--query') ?? DEFAULT_QUERY;
const etalon = loadEtalon();

try {
  console.log(`Аудит запитів до OLX, запит «${query}» (4 запити, пауза 1–6 с між ними)`);
  const rows = await runOlxAudit(query, etalon, (id) => console.log(`→ ${AUDIT_PROBE_LABELS[id]}`));
  printReport(rows, etalon);

  if (update) {
    const next: AuditEtalon = Object.fromEntries(rows.map((row) => [row.id, row.live]));
    writeFileSync(ETALON_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nЕталон оновлено: ${ETALON_PATH}`);
    process.exit(0);
  }

  const changed = rows.some((row) => row.diff === null || hasDiff(row.diff));
  console.log(changed ? '\nЄ розбіжності з еталоном — див. docs/olx-api.md §5.' : '\nУсе збігається з еталоном.');
  process.exit(changed ? 1 : 0);
} catch (err) {
  console.error(`Аудит упав: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
