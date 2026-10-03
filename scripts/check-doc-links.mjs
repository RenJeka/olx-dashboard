// Перевірка посилань у документації (npm run docs:check).
// - markdown-лінки [текст](шлях) — відносно файлу, де вони стоять;
// - «голі» шляхи `docs/…md` без бектиків — відносно кореня;
// - бектик-шляхи `docs/…`, `server/…`, `web/…`, `.claude/…`, `.agents/…` — відносно кореня репо
//   (або відносно файлу, якщо починаються з ./ чи ../).
// Історичні знімки (docs/plans/old/, docs/handoffs/) — стан на момент запису: у них перевіряються лише
// посилання на документи (.md), шляхи до коду не перевіряються; посилання на план, який згодом
// перенесено в docs/plans/old/, валідне (історію не переписуємо — docs/rules.md → «Хендофи»).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const HISTORICAL_DIRS = ['docs/plans/old/', 'docs/handoffs/'];
const MD_LINK = /\]\(([^)\s#]+)(?:#[^)]*)?\)/g;
const CODE_PATH =
  /`((?:\.\.?\/)*(?:docs|server|web|scripts|skills|\.claude|\.agents)\/[^`\s*<>{}|]+?\.(?:md|ts|tsx|sql|py|json|mjs))`/g;

// «голі» шляхи до документів без бектиків (напр. у коментарях дерева structure.md)
const BARE_DOC = /(?<![\w/.`-])(docs\/[\w./-]+?\.md)(?![\w`])/g;

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
process.chdir(root);
// Відстежувані + нові (ще не додані), без ігнорованих.
const files = execSync('git ls-files --cached --others --exclude-standard "*.md"', {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

// docs/plans/<name>.md, якого вже немає, але є в docs/plans/old/ — план заархівовано після знімка.
const archivedPlan = (p) => {
  const m = /^docs[\\/]plans[\\/]([^\\/]+\.md)$/.exec(p);
  return m != null && existsSync(join('docs/plans/old', m[1]));
};
const exists = (p, historical) => existsSync(p) || (historical && archivedPlan(p));

const resolve = (file, p) => (/^\.\.?\//.test(p) ? normalize(join(dirname(file), p)) : p);
const broken = [];

for (const file of files) {
  const historical = HISTORICAL_DIRS.some((d) => file.startsWith(d));
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [, p] of line.matchAll(MD_LINK)) {
        if (/^(https?:|mailto:)/.test(p)) continue;
        if (historical && !p.endsWith('.md')) continue;
        if (!exists(normalize(join(dirname(file), p)), historical)) broken.push(`${file}:${i + 1}  ${p}`);
      }
      for (const [, p] of line.matchAll(CODE_PATH)) {
        if (historical && !p.endsWith('.md')) continue;
        if (!exists(resolve(file, p), historical)) broken.push(`${file}:${i + 1}  ${p}`);
      }
      for (const [, p] of line.matchAll(BARE_DOC)) {
        if (!exists(p, historical)) broken.push(`${file}:${i + 1}  ${p}`);
      }
    });
}

for (const b of broken) console.log(b);
console.log(`\nПеревірено файлів: ${files.length}. Битих посилань: ${broken.length}.`);
process.exit(broken.length ? 1 : 0);
