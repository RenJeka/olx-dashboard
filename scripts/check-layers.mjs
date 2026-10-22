// Перевірка напряму залежностей між шарами сервера (npm run layers:check;
// docs/plans/refactor-clean-architecture.md → «Цільова архітектура»).
// Розбирає імпорти server/src/**/*.ts (без тестів і test/) і звіряє з правилами нижче.
// Без --strict — лише звіт (порушення друкуються, вихід 0): поки рефакторинг не дійшов до кінця.
// З --strict — порушення валять перевірку (вихід 1).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

const ROOT = 'server/src';
const strict = process.argv.includes('--strict');

/** Правило: файли під `from` не імпортують нічого під жодним із `forbid` (шляхи відносно server/src). */
const RULES = [
  { from: 'routes/', forbid: ['db/db'], why: 'маршрути — без SQL: через сервіси/репозиторії' },
  { from: 'services/', forbid: ['db/db', 'routes/'], why: 'сервіси — SQL лише в db/repos/, без HTTP' },
  ...['scanner/', 'analysis/', 'categories/'].map((from) => ({
    from,
    forbid: ['db/db'],
    why: 'доменні модулі — SQL лише в db/repos/',
  })),
  { from: 'scraper/', forbid: ['db/', 'routes/', 'services/', 'scanner/'], why: 'скрейпер — лише OLX і чиста логіка' },
  { from: 'db/', forbid: ['routes/', 'services/', 'scanner/', 'analysis/', 'categories/'], why: 'шар БД — найнижчий' },
  { from: '', forbid: ['cli/'], why: 'CLI — лише точки входу' },
  { from: '', forbid: ['routes/'], except: ['index.ts', 'routes/'], why: 'маршрути імпортує лише index.ts' },
];

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const toPosix = (p) => p.split(sep).join('/');
const files = walk(ROOT)
  .map((p) => toPosix(relative(ROOT, p)))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('test/'));

const violations = [];
for (const file of files) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec.startsWith('.')) continue; // пакети npm — не шари
    const target = toPosix(normalize(join(dirname(file), spec))).replace(/\.js$/, '');
    for (const rule of RULES) {
      if (!file.startsWith(rule.from)) continue;
      if (rule.except?.some((e) => file === e || file.startsWith(e))) continue;
      const hit = rule.forbid.find((f) => target === f || target.startsWith(f));
      if (hit) violations.push(`server/src/${file} → ${target}  (${rule.why})`);
    }
  }
}

for (const v of violations) console.log(v);
console.log(`\nПорушень шарів: ${violations.length}${strict ? '' : ' (режим звіту — не блокує; строгий — --strict)'}.`);
if (strict && violations.length > 0) process.exit(1);
