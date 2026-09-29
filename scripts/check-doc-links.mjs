// Перевірка посилань у документації (npm run docs:check).
// - markdown-лінки [текст](шлях) — відносно файлу, де вони стоять;
// - «голі» шляхи `docs/…md` без бектиків — відносно кореня;
// - бектик-шляхи `docs/…`, `server/…`, `web/…`, `.claude/…`, `.agents/…` — відносно кореня репо
//   (або відносно файлу, якщо починаються з ./ чи ../).
// Історичні плани (docs/plans/old/) — знімок на момент виконання: у них перевіряються лише
// посилання на документи (.md), шляхи до коду не перевіряються.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const HISTORICAL_DIR = 'docs/plans/old/';
const MD_LINK = /\]\(([^)\s#]+)(?:#[^)]*)?\)/g;
const CODE_PATH =
  /`((?:\.\.?\/)*(?:docs|server|web|scripts|\.claude|\.agents)\/[^`\s*<>{}|]+?\.(?:md|ts|tsx|sql|py|json|mjs))`/g;

// «голі» шляхи до документів без бектиків (напр. у коментарях дерева structure.md)
const BARE_DOC = /(?<![\w/.`-])(docs\/[\w./-]+?\.md)(?![\w`])/g;

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
process.chdir(root);
const files = execSync('git ls-files "*.md" "docs/plans/TODO"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const resolve = (file, p) => (/^\.\.?\//.test(p) ? normalize(join(dirname(file), p)) : p);
const broken = [];

for (const file of files) {
  const historical = file.startsWith(HISTORICAL_DIR);
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [, p] of line.matchAll(MD_LINK)) {
        if (/^(https?:|mailto:)/.test(p)) continue;
        if (historical && !p.endsWith('.md')) continue;
        if (!existsSync(normalize(join(dirname(file), p)))) broken.push(`${file}:${i + 1}  ${p}`);
      }
      for (const [, p] of line.matchAll(CODE_PATH)) {
        if (historical && !p.endsWith('.md')) continue;
        if (!existsSync(resolve(file, p))) broken.push(`${file}:${i + 1}  ${p}`);
      }
      for (const [, p] of line.matchAll(BARE_DOC)) {
        if (!existsSync(p)) broken.push(`${file}:${i + 1}  ${p}`);
      }
    });
}

for (const b of broken) console.log(b);
console.log(`\nПеревірено файлів: ${files.length}. Битих посилань: ${broken.length}.`);
process.exit(broken.length ? 1 : 0);
