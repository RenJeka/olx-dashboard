# Handoff: харнес сесій, `gh`, S9 (глибокі скани на проді)

2026-10-03 · сесія 2026-10-01…03: перенос харнесу сесій з youtrack → DRY-аудит доків → `gh` → S9: перевірка
на проді → розслідування → фікс (самопінг + закриття обірваних) → перевірка на проді → закриття сесії.
Попередній handoff — `docs/handoffs/2026-09-30-render-on-main.md`.

## Objective

Пріоритети людини без змін: **(1) базова стабільність**, **(2) мінімальний харнес розробки й деплою**,
**(3) фіча «модель JEV»**. Ця сесія: харнес сесій/пам'яті з проєкту youtrack + закрити S9.

## Current state (ви тут)

- `main` = `093da85` (PR #37) + PR цього закриття сесії. Прод (обидва сервіси Render) — автодеплой з `main`,
  live, `/health` 200. Незакомічених змін немає, крім `.claude/settings.json` (untracked, не з цих сесій).
- S9 ✅: довгий deep-скан на проді доживає із закритою вкладкою (скан 31 `iphone`: 679/679, 34 хв).
- Наступна робота — у порядку людини: **S6 → S4 → S14 → S10 → H3–H6** (деталі — `current.md`).

## Decisions (і чому)

- **Харнес сесій з youtrack, адаптований** (людина обрала варіанти): `docs/parking.md` замість
  `docs/plans/TODO`; `docs/instructions/` (по файлу на пастку); `docs/current.md` + `docs/rules.md`
  (імпорт `@docs/rules.md` в `AGENTS.md`); **без** `handoff-import`; формат хендофа — olx-івський.
- **DRY (запит людини):** у `docs/rules.md` — таблиця «Де живе факт»; повтори в доках/скілах замінено
  посиланнями. Пам'ять агента з дублем про абсолютні шляхи видалено (джерело — інструкція в репо).
- **`gh` встановлено** (winget), вхід `RenJeka` (device flow); агент сам відкриває PR, дивиться CI й
  зливає — коли людина дозволила («зливай ПР, якщо потрібно»). Merge — «Create a merge commit».
- **S9 — причина (висока впевненість, підтверджено):** free-інстанс Render засинає після 15 хв без вхідних
  запитів; deep-скан іде всередині одного довгого HTTP-запиту; поллінг фронту на паузі у фоновій вкладці.
  Моя початкова гіпотеза «OOM на фіналізації» — **хибна**.
- **Фікс S9 — рішення людини:** самопінг сервера під час скану + закриття обірваних сканів на старті.
  Відхилено людиною: поллінг у фоні, платний тариф.
- **Рев'ю CodeRabbit PR #36:** зауваження про перекриття інстансів при деплої — **відхилено** (скан на старому
  інстансі гине при cutover; якщо встигне — `FINALIZE_SUCCESS_SQL` ставить `error = NULL`; lease = схема +
  записи в Turso). Відповідь — у треді PR.

## Dead ends — не повторювати

- **Паралельні «очікування + запит до БД»:** виконуються одночасно → «застарілі» дані, хибна тривога
  «скан стоїть» → `docs/instructions/prod-scan-monitoring.md`.
- **CRLF після `git pull`:** скрипт точної заміни падав «не знайдено» → `docs/instructions/crlf-line-endings.md`.
- **`docs:check` локально зелений, у CI — червоний:** бектик-шлях до untracked-файлу →
  `docs/instructions/docs-check-untracked-files.md`.
- **Код пристрою `gh` прострочився** (15 хв) — запускати вхід лише коли людина готова (`github-cli.md`).
- Render `list_logs` з `type: request` на free-тарифі порожній — лише `type: app`.

## Artifacts

- PR #34 (харнес сесій, DRY, `gh`-інструкція), #35 (`current.md`), #36 (фікс S9), #37 (закриття S9) — злиті.
- `server/src/scanner/keepAlive.ts` (+ test), `closeInterruptedScanRuns` у `scanRunLifecycle.ts` (+ test),
  виклик у `server/src/index.ts` — у проді.
- `docs/plans/old/scan-keepalive.md` — ✅; `docs/plans/old/` — історичні.
- `docs/plans/stability-baseline.md` — додано **S14** (великий пошук `iphone`), S10 з поясненням простими
  словами (`vitest-setup.md`).
- Прод-БД: `scan_runs` 27 (mac mini), 29 (закрито стартом як перерваний), 31 (iphone, успішний).
- Гілки `handoff-2026-09-30`, `docs/post-pr34-state`, `fix/s9-scan-keepalive`, `docs/s9-done` — не видалялись.

## Verbatim essentials

- Render workspace `tea-d8mh9lrbc2fs73dvtbv0` (обов'язковий `workspaceId` для metrics/logs/events).
- Скан 31: старт 04:07:41 UTC, останній поллінг браузера 04:08:42, самопінги 04:12:41, 04:17:41, …,
  `finished_at` 04:42:14, без `error`.
- Текст помилки обірваного скану: «Скан перервано: процес сервера зупинився (засинання або рестарт). Зібране до
  обриву збережено.»

## Working preferences

- Людина вирішує через варіанти з рекомендацією; перед дією на проді — що саме запускаємо і її «так».
- Пояснювати простими словами (S10 був незрозумілий) — перед рішенням людини.

## Open items

- **Next step:** S6 — `npm audit fix` (без `--force`) → `npm run check` + smoke → PR.
- **Then:** S4 (HTML-fallback `403`, діагностика за `olx-api.md` §5, без Playwright) → S14 (великий `iphone`,
  разом із людиною) → S10 (пояснити простими словами, рішення людини) → H3–H6 (`dev-deploy-harness.md`).
- **Unresolved questions (чекають людину):** «модель JEV»; чи копіювати `OPENROUTER_API_KEY`; коли видаляти
  бекап-гілку Turso; скіл з інструкції `prod-scan-monitoring` (запропоновано, не створено).
- **Blocked:** ручна перевірка скілів в Antigravity; `/session-start` у новій сесії — людина.

## Що змінилося в документації

- Інструкції: нові — `prod-scan-monitoring`, `github-cli` (замість `github-pr-links`), `docs-check-untracked-files`
  + 10 стартових; доповнено — `crlf-line-endings`.
- Парковка: нові P-001…P-004 · закриті: —
- Плани: ✅ і в `old/` — `scan-keepalive`; оновлено — `stability-baseline` (S9 ✅, S14), `dev-deploy-harness`,
  `session-harness`, `vitest-setup`.
- Скіли: нові — `session-start`, `session-close`, `instruction-add`, `parking-add`, `skill-from-instruction`;
  запропоновано — `prod-scan-monitoring`.

## Suggested opening prompt

> /session-start
>
> Порядок роботи (моє рішення): **S6 → S4 → S14 (великий `iphone`) → S10 → харнес H3–H6**. Почнемо з S6:
> `npm audit fix` без `--force`, перевірки, smoke, PR — злити можеш сам після зеленого CI. Перед S4 і S14
> скажи, що саме запускатимемо на проді, і чекай мого «так». До S10 спершу поясни простими словами, про що
> питання, і дай варіанти з рекомендацією.
