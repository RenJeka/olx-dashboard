# Handoff: автогрупування критеріїв, реліз PR #67 і #68

2026-10-11 · сесія: старт → злиття PR #67 (бекап Turso, деплой, smoke) → автогрупування (код, браузер, test-cases
людини) → PR #68 (рев'ю CodeRabbit, фікс, злиття, деплой) → закриття.
Попередній handoff — `docs/handoffs/2026-10-11-pr67-new-plans.md`.

## Objective

Кнопка «Згрупувати автоматично» у вікні «Плюси та мінуси» ([criteria-auto-group](../plans/old/criteria-auto-group.md));
перед кодом — злити PR #67 (рішення людини).

## Current state (ви тут)

- `main` = `6fb06d3` (merge PR #68); обидва сервіси Render `live` на ньому, `npm run smoke` ✅.
- PR #67 злито (`1aab405`), задеплоєно, smoke ✅. PR #66 GitHub позначив `MERGED` сам (його коміт прийшов з #67).
- Гілка `docs/close-2026-10-11-auto-group` — доки закриття сесії; PR — див. Artifacts.
- Плани criteria-categories і criteria-auto-group — ✅, в `old/`.

## Decisions (і чому)

- **Спершу злити #67, далі нова гілка `feat/criteria-auto-group`** (людина).
- **«Роби без повторного підтвердження»** (людина) — на бекап Turso, злиття #67, закриття #66, нову гілку;
  «зливай #68 після рев'ю» — окремий дозвіл.
- **Бекап перед злиттям #67** — гілка Turso `olx-dashboard-bak-20261011` із захистом від видалення (перше
  об'єднання критеріїв на проді переписує `listings.cons/pros`).
- **Автогрупування:** застосування — `merges: [{from,to}]` у наявному `POST /criteria/remap` (послідовні `planRemap`,
  один прохід по оголошеннях, один `recomputeFilteredOut`); погана назва групи → перший член (не відкидати групу);
  кнопка — через проп `extraActions` у `CriteriaInputBar`, лише у вікні «Плюси та мінуси» (не в майстрі).
- **Промпт посилено** після браузера: «можуть стояти поруч як два різні факти → не об'єднувати» + контрприклади.
  `flash-lite` все одно часом об'єднує зайве — людина знімає у вікні; точність — у
  [llm-haiku-prompt-audit](../plans/llm-haiku-prompt-audit.md) (агент, людина не заперечила).
- **CodeRabbit на #68:** guard `null` у `parseGroupSuggestions` — виправлено (`87d41b2`); `current.md` — у цьому
  docs-PR.

## Dead ends — не повторювати

- **JS `.click()` / `PointerEvent` на пункті меню «⋮»:** меню закривається, вікно не відкривається. Клавіатура →
  `docs/instructions/wmux-browser-ark-menu.md`.
- **`grep -rl … docs | xargs sed` при перенесенні плану:** зачепив хендоф → відкат комітом `666d450`.
  → `docs/instructions/plan-archive-links.md`.
- **`'\\n'` у Python-heredoc для правок TS:** у файл потрапив справжній перенос рядка всередині рядкового літерала —
  правити такі місця Edit-ом ([scripted-edit-assert](../instructions/scripted-edit-assert.md)).
- **curl з кирилицею в JSON (Git Bash):** тіло зіпсоване — `node -e "fetch(…)"` ([curl-cyrillic-body](../instructions/curl-cyrillic-body.md)).
- **`gh pr close 66`** заблокував auto-mode — дописано в [github-cli](../instructions/github-cli.md).
- **Render MCP без `workspaceId`:** «no workspace selected» — дописано в скіл `session-start`.

## Artifacts

- PR [#67](https://github.com/RenJeka/olx-dashboard/pull/67) — злито, задеплоєно.
- PR [#68](https://github.com/RenJeka/olx-dashboard/pull/68) — злито (`6fb06d3`), задеплоєно, smoke ✅.
- PR #66 — `MERGED` (через #67).
- Turso `olx-dashboard-bak-20261011` — бекап прод-БД перед #67, захист від видалення — фінал.
- Новий код: `POST /criteria/group-suggest`, `merges` у `remap`, `buildGroupingPrompt`, `parseGroupSuggestions`,
  `GroupSuggestionsDialog.tsx`.

## Verbatim essentials

- Render workspace `tea-d8mh9lrbc2fs73dvtbv0`; API `srv-d8ujfrnlk1mc73fuberg` (деплой `dep-db5uh649v7es739grfb0`),
  фронт `srv-d8ujhi1o3t8c73drge0g` (`dep-db5uh6c9v7es739grfhg`).
- Приклади хибного групування `gemini-2.5-flash-lite` (локально, «macbook m1», «Плюси»): «16 Гб оперативної пам'яті» +
  «512 Гб диску» → «пам'ять»; «ідеальний стан» + «екран без пошкоджень» + «не розбирався» → «стан»; після посилення
  промпту — «повна комплектація» + «оригінальна коробка» + «з зарядним пристроєм», «екран без пошкоджень» +
  «без подряпин» + «відсутні подряпини».

## Open items

- **Next step:** [llm-haiku-prompt-audit](../plans/llm-haiku-prompt-audit.md) — Haiku 5.5, аудит промптів (зокрема
  автогрупування), замір `llm:eval`; платні заміри — після «так» людини.
- **Then:** платний прогін порогу Jev ([jev-threshold-setting](../plans/jev-threshold-setting.md), test-case 3);
  ручна перевірка кроку 2 рушієм Jev ([jev-model](../plans/jev-model.md)).
- **Unresolved questions (чекають людину):** злиття цього docs-PR; коли видаляти бекап-гілки Turso
  (`olx-dashboard-bak-20260930`, `olx-dashboard-bak-20261011`).

## Що змінилося в документації

- Інструкції: нові `wmux-browser-ark-menu`, `plan-archive-links`; дописано `github-cli`.
- Парковка: без змін.
- Плани: criteria-auto-group ✅ → `old/` (у PR #68); criteria-categories ✅ → `old/`; статуси jev-threshold-setting,
  llm-haiku-prompt-audit.
- Скіли: `session-start` — `workspaceId` для Render MCP.

## Suggested opening prompt

> /session-start. Беремо план docs/plans/llm-haiku-prompt-audit.md — Haiku 5.5 і аудит промптів (плюси в мінусах,
> автогрупування). Платні заміри — лише після мого «так».
