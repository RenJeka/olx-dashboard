# Handoff: рефакторинг — прагматична чиста архітектура

2026-10-23 · сесія: старт → аналіз архітектури й план → фаза 0 (тести) → 1 (каркас) → 2–3 (пошуки, проекти,
оголошення, журнал) → 4 (AI, категорії) → 7 (фронтенд) → 8 (доки, `/docs-audit`) → PR.
Попередній handoff — `docs/handoffs/2026-10-22-category-filter-counts.md`.

## Objective

Людина: «рефакторинг коду, розділення складного коду на менші окремі частини, чиста архітектура; оновити
документацію + `/docs-audit`». Критерій — поведінка не змінюється, кожна фаза — окремий коміт із зеленим
`npm run check`.

## Current state (ви тут)

- Гілка `refactor/phase-0-tests` (від `main` = `f7cf0c1`), коміти фаз 0–4, 7, 8 + коміт закриття сесії; запушено,
  PR у `main` відкрито агентом за дорученням людини. **Не злито** — злиття = деплой, лише з «так» людини.
- План [refactor-clean-architecture](../plans/refactor-clean-architecture.md) — 🟢 активний: фази 5–6 (сканер,
  скрейпер) і 7.4 відкладено людиною.
- `layers:check` (режим звіту): лишились порушення лише в `scanner/` і `scraper/` (фази 5–6).
- Незакомічене (не наше, не чіпали): `.codex/`, `.vscode/olx-dashboard.code-workspace`.
- Dev-сервери `:3001`/`:5173` були запущені людиною (не агентом) — не зупиняли. Тимчасові сервери агента на `:3099`
  зупинено.

## Decisions (і чому)

- **Прагматична архітектура** (агент запропонував, людина погодила): `routes/` (HTTP) → `services/` і доменні модулі →
  `db/repos/` (SQL). Без DI і шарів «заради шарів». Обсяг — `server/` + `web/` (фронт — лише тактичні розрізи: він уже
  шаровий).
- **Варіант Б (людина):** 5xx не-скан-роутів ідуть у журнал `app_logs` через спільний обробник. Скан-роути лишили
  власний `catch` — `withScanRun` уже пише збій у журнал (без подвійного запису).
- **Фази 4, 7, 8 після 0–3; 5–6 не робити зараз (людина).** Знахідка фази 0: цикли варіантів у `fetchAllQueries` і
  `runDeepScanFromPlan` різняться прогресом, перевіркою «Зупинити» й обробкою одного варіанта — злиття лише з
  параметрами або лише спільні шматки (рішення людини на фазі 5).
- **Правило шарів у `AGENTS.md` → «Конвенції»** — агент вважав «зроби фазу 8» згодою людини (сказано людині).
- **Поле `source` живих інструкцій — без PR і хешів** (людина 2026-10-23) → `rules.md` п. 2.
- Журнал `olx-api.md` §6 зі старими назвами файлів — не чіпати (історія; людина «ок»).

## Dead ends — не повторювати

- **Heredoc `cat >> file <<'EOF'` з великим TS-текстом у Bash** — «unexpected EOF while looking for matching `''»;
  дописувати Edit/Write.
- **`grep -c $'\r$'` для перевірки CRLF у Git Bash** — 0 і для CRLF-файлу; точні заміни скриптом падали «0 збігів»
  → [crlf-line-endings](../instructions/crlf-line-endings.md).
- **Саморобний детектор невикористаних імпортів** — хибні спрацьовування; надійно — разово
  `tsc --noEmit --noUnusedLocals` (у `tsconfig` прапорця немає).
- **`timeout 90 node …` у Git Bash** не зупиняє node на Windows — зупиняти за портом через PowerShell.
- **Правка дерева `structure.md` скриптом за індексами** втратила рядок `db/copyDb.ts` (фаза 4); знайдено аудитом,
  відновлено. Після скриптових правок доків — `git diff <база> -- docs/structure.md | grep '^-'`.

## Artifacts

- Нове: `server/src/errors.ts`, `routes/errorHandler.ts`, `test/app.ts` (`testApp()`), `services/{searches,projects,listings,logs}.ts`,
  `db/repos/{searches,projects,listings,scanRuns,logs,analysis,categories,batch}.ts`, `analysis/criteriaRemap.ts`,
  `server/src/cli/` (CLI-скрипти перенесено), `scripts/check-layers.mjs` (`npm run layers:check`, у `check`).
- `analysis/repo.ts` → `db/repos/analysis.ts`; `loadPickCandidates` тепер приймає ліміт параметром.
- Web: `action-panel/scan-plan/*`, `local-filters/category-tree/*`, `hooks/useScanPlanReport.ts`, `utils/scanRun.ts`,
  форматери в `utils/format.ts`, `collectBranchKeys` у `utils/categoryCounts.ts`.
- Тести: `routes/{projects,logs,aiCommit}.test.ts`, `scanner/variantLoop.test.ts`, розширено `routes/{searches,listings}.test.ts`.
- Звірка на копії проду: фази 2–3 — 52 GET-відповіді, фаза 4 — 13; розбіжностей 0
  ([api-equivalence-check](../instructions/api-equivalence-check.md)).
- Браузер (wmux, локально, «iphone»): збережений «Аналіз перед сканом» і дерево «Категорії» — рендер ок, консоль чиста.

## Open items

- **Next step:** людина переглядає PR; після зеленого CI і «так» — злиття, деплой, `npm run smoke`.
- **Then:** фази 5–6 плану (сканер: `planCache`, дубль циклу варіантів, SQL; скрейпер без БД; `layers:check --strict`);
  7.4 — за потреби.
- **Unresolved questions (чекають людину):** ручні test-cases плану в UI людина не проходила (замінено звіркою API й
  перевіркою в браузері агентом); решта — `docs/current.md`.

## Що змінилося в документації

- Інструкції: нова [api-equivalence-check](../instructions/api-equivalence-check.md); доповнено
  [crlf-line-endings](../instructions/crlf-line-endings.md), [wmux-browser-ark-menu](../instructions/wmux-browser-ark-menu.md);
  `source` без PR/хеша — `docs-check-untracked-files`, `plan-archive-links`.
- Парковка: P-006 звужено (маршрути API покрито) · закриті: —
- Плани: новий `refactor-clean-architecture` (🟢)
- Скіли: запропоновано скіл з `api-equivalence-check` (процедура з кроками) — рішення людини.
- Доки: `architecture.md` (§4 шари, `db/repos`, `services`, `criteriaRemap`, обробник помилок, форматери),
  `structure.md`, `development.md`, `ai-flow.md`, `AGENTS.md` (команди, правило шарів), `rules.md` п. 2, `current.md`.

## Suggested opening prompt

> /session-start Продовжуємо рефакторинг: перевір стан PR гілки `refactor/phase-0-tests` (CI, злиття), потім — фаза 5
> плану refactor-clean-architecture (сканер), спершу покажи варіанти злиття циклів варіантів.
