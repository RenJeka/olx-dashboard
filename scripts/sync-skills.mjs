// Генерує тонкі обгортки скілів з єдиного джерела skills/<name>/SKILL.md.
//   npm run skills:sync   — перезаписати обгортки в .claude/skills/ і .agents/skills/
//   npm run skills:check  — лише перевірити, що обгортки актуальні (exit 1, якщо ні)
// Цілі для кожного скіла — skills/skills.json. Обгортка несе лише frontmatter, за яким
// інструмент знаходить скіл (name/description/license), і вказівку прочитати канонічний файл.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TARGET_DIRS = { claude: '.claude/skills', agents: '.agents/skills' };
const WRAPPER_KEYS = new Set(['name', 'description', 'license']);
const MARKER = 'Згенеровано scripts/sync-skills.mjs';

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
process.chdir(root);
const checkOnly = process.argv.includes('--check');
const manifest = JSON.parse(readFileSync('skills/skills.json', 'utf8')).skills;
const problems = [];

/** Сирі рядки верхньорівневих ключів frontmatter (з продовженнями), без переформатування YAML. */
function pickFrontmatter(skillMd, file) {
  const lines = skillMd.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') throw new Error(`${file}: немає frontmatter`);
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error(`${file}: незакритий frontmatter`);
  const out = [];
  let keep = false;
  for (const line of lines.slice(1, end)) {
    const key = /^([A-Za-z_-]+):/.exec(line)?.[1];
    if (key) keep = WRAPPER_KEYS.has(key);
    if (keep) out.push(line);
  }
  return out.join('\n');
}

function wrapper(name, frontmatter) {
  const src = `skills/${name}/SKILL.md`;
  return `---
${frontmatter}
---

<!-- ${MARKER} з ${src} — не редагувати вручну; правити джерело й запустити npm run skills:sync. -->

# ${name} — обгортка

Повні інструкції цього скіла лежать в єдиному джерелі: \`${src}\` (шлях від кореня
репозиторію; від цього файлу — \`../../../${src}\`).

1. Перш ніж діяти, прочитай \`${src}\` повністю і виконуй його як інструкції цього скіла.
2. Допоміжні файли (напр. \`references/\`) лежать поруч із ним у \`skills/${name}/\` — відносні
   шляхи з канонічного SKILL.md рахуй від цієї теки.
`;
}

// Кожна тека skills/* має бути в маніфесті, і навпаки.
const sourceDirs = readdirSync('skills', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
for (const d of sourceDirs) if (!manifest[d]) problems.push(`skills/${d}: немає в skills/skills.json`);

const expected = new Map(); // шлях обгортки → вміст
for (const [name, targets] of Object.entries(manifest)) {
  const src = join('skills', name, 'SKILL.md');
  if (!existsSync(src)) { problems.push(`${src}: не існує`); continue; }
  const fm = pickFrontmatter(readFileSync(src, 'utf8'), src);
  if (!new RegExp(`^name:\\s*['"]?${name}['"]?\\s*$`, 'm').test(fm)) problems.push(`${src}: name ≠ ${name}`);
  for (const t of targets) {
    if (!TARGET_DIRS[t]) { problems.push(`${name}: невідома ціль «${t}»`); continue; }
    expected.set(`${TARGET_DIRS[t]}/${name}/SKILL.md`, wrapper(name, fm));
  }
}

// Зайві теки в цільових каталогах (застарілі обгортки або ручні копії).
for (const dir of Object.values(TARGET_DIRS)) {
  if (!existsSync(dir)) continue;
  for (const d of readdirSync(dir, { withFileTypes: true }).filter(x => x.isDirectory())) {
    const p = `${dir}/${d.name}/SKILL.md`;
    if (expected.has(p)) continue;
    const isOurs = existsSync(p) && readFileSync(p, 'utf8').includes(MARKER);
    if (checkOnly || !isOurs) problems.push(`${dir}/${d.name}: зайва тека (не з маніфесту${isOurs ? '' : ', не згенерована — перенеси в skills/'})`);
    else rmSync(`${dir}/${d.name}`, { recursive: true });
  }
}

for (const [p, content] of expected) {
  const actual = existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : null;
  if (actual === content) continue;
  if (checkOnly) problems.push(`${p}: ${actual === null ? 'відсутня' : 'застаріла'} обгортка`);
  else { mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true }); writeFileSync(p, content); console.log(`оновлено ${p}`); }
}

for (const p of problems) console.log(p);
console.log(`\nСкілів: ${Object.keys(manifest).length}, обгорток: ${expected.size}. Проблем: ${problems.length}.`);
process.exit(problems.length ? 1 : 0);
