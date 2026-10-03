# План: харнес документації з точкою входу в `AGENTS.md`

> **Статус:** ✅ виконано (2026-10-03) · етапи 1–7; ручну перевірку в Antigravity знято (людина його не використовує).

## Контекст

Документація розрослася до ~67 файлів (`AGENTS.md`, `README.md`, `docs/`, `docs/plans/`,
`docs/plans/old/`, скіли в `.claude/` і `.agents/`). Аудит (2026-09-29) виявив:

1. **Биті посилання** — плани перенесено в `docs/plans/old/` без оновлення лінків; після
   рефакторингів (`scanner.ts` → `scanner/`, `graphqlOlxFetcher.ts` → `scraper/graphql/`,
   компоненти → підпапки) у живих доках лишились шляхи до неіснуючих файлів. Скрипт-перевірка
   знайшов 189 битих посилань (після виправлення — 0).
2. **`CLAUDE.md` видалено** (замінено на `AGENTS.md`), але на нього посилаються плани, промпти, скіли.
3. Статуси планів розходяться з реальністю (чекбокси не відмічені для злитих фіч).
4. `AGENTS.md` перевантажений деталями фіч (~150 з 291 рядка).
5. Скіли у двох теках (`.claude/skills`, `.agents/skills`) з дублікатом `chakra-ui-builder`.
6. Перекриття `olx-monitor-spec.md` / `architecture.md` / `AGENTS.md` (схема БД, інваріанти).
7. Немає документа про тестування/процес.

Мета — `AGENTS.md` як коротка карта (інваріанти + куди дивитись), решта — тематичні документи
з робочими посиланнями, і автоматична перевірка, що посилання не ламаються знову.

## Файли

- `scripts/check-doc-links.mjs` — перевірка посилань (нове), `package.json` — скрипт `docs:check`.
- `AGENTS.md`, `README.md`, `docs/*.md`, `docs/plans/**/*.md`, `.agents/skills/simplify/SKILL.md`.

## Кроки

### Етап 1–2: биті посилання + `CLAUDE.md`
- [x] Скрипт `scripts/check-doc-links.mjs` + `npm run docs:check` (markdown-лінки відносно
      файлу; бектик-шляхи `docs|server|web|.claude|.agents/…` відносно кореня / файлу).
- [x] Посилання на плани, перенесені в `docs/plans/old/`, → нові шляхи (усі файли).
- [x] Відносні лінки всередині `docs/plans/old/` (`../olx-api.md` → `../../olx-api.md`).
- [x] `CLAUDE.md` → `AGENTS.md` у всіх документах і скілах (включно з історичними планами —
      `AGENTS.md` є прямим наступником того самого канону).
- [x] Шляхи до коду в **живих** документах (`AGENTS.md`, `README.md`, `docs/*.md`, активні
      плани) → актуальні файли після рефакторингів.
- [x] Історичні плани `docs/plans/old/*`: шляхи до коду НЕ переписувати (це знімок на момент
      виконання); перевірка їх пропускає, у шапці `old/` — примітка про це.
- [x] `npm run docs:check` → 0 битих.

### Етап 3–7
- [x] Статуси планів: рядок `> **Статус:**` у шапці всіх 39 планів; кроки реалізації звірено з кодом
      (google-oauth-gate, render-turso-phase0, deep-scan-stop-and-history, filter-invert); 9 виконаних
      планів перенесено в `old/`; `docs:check` ловить і «голі» шляхи `docs/…md`; правило — в `AGENTS.md`.
- [x] Скоротити `AGENTS.md` до карти (294 → ~136 рядків): короткі інваріанти + таблиця «питання →
      документ»; механіка сканів/статусів/схеми дослівно → новий `docs/business-rules.md`,
      детальні AI-інваріанти → `docs/ai-flow.md` («Детальні інваріанти кроків»).
- [x] Скіли: єдине джерело `skills/<name>/` (корінь репо); `.claude/skills/` (Claude Code) і
      `.agents/skills/` (Antigravity) — лише тонкі обгортки (frontmatter `name`/`description` +
      «прочитай `skills/<name>/SKILL.md`»), що генеруються `scripts/sync-skills.mjs` з маніфесту
      `skills/skills.json` (цілі для кожного скіла). `simplify` — лише `.agents` (конфлікт з
      вбудованим `/simplify` Claude Code). `npm run skills:sync` / `skills:check` (у `check`).
- [x] Перевірка: `skills:check` + `docs:check` зелені; Claude Code у headless-режимі (`claude -p`)
      бачить скіли й доходить до канонічного файлу (refactor-plan) і до `references/` (chakra-ui-builder).
- [x] ~~Antigravity — ручна перевірка~~ знято 2026-10-03: людина Antigravity не використовує.
- [x] Розвести ролі: `olx-monitor-spec.md` — продукт (концепція, вимоги зі статусом ✅/⏳, етапи з
      критеріями готовності, поза скоупом, ризики); `architecture.md` — поточна реалізація;
      `business-rules.md` — доменні правила; `AGENTS.md` — карта. Зі spec прибрати застарілі дублі
      (діаграма з better-sqlite3, стек із Tailwind, копія схеми, статусна логіка, REST, структура) —
      діаграму станів перенести в `business-rules.md`.
- [x] Виправити розбіжність: `price_history` кодом НЕ наповнюється (`normalizer.ts`: «Етап 3») —
      у `AGENTS.md`/`business-rules.md` позначити як ⏳ Етап 3, не як діючий інваріант.
- [x] `architecture.md`: прибрати застаріле («реалізовано Етап 1», «без зовнішніх сервісів»,
      `addColumnIfMissing`, посилання на spec §5).
- [x] `docs/development.md` — процес і перевірка: цикл задачі, драбина перевірок (typecheck →
      docs:check → smoke → UI через `playwright-tester`), правила роботи з живим OLX і БД, міграції
      схеми, Definition of Done, пріоритети майбутніх автотестів. Скрипти `typecheck` і `check`.

## Test-cases

- `npm run docs:check` завершується з кодом 0 і `BROKEN: 0`.
- `grep -rn "CLAUDE.md"` по репо (без `node_modules`) — лише пояснювальна згадка в `AGENTS.md`.
- Штучно зламане посилання в будь-якому `.md` → `docs:check` падає з кодом 1 і показує файл:рядок.
