# Handoff: реліз доробок base-criteria (P-019) і план лічильників фільтра категорій

2026-10-22 · сесія: session-start (підтягнуто `main`) → ручні тести PR #80 (копія проду) → злиття й реліз →
план «лічильники у фільтрі Категорії» → закриття.
Попередній handoff — `docs/handoffs/2026-10-18-base-criteria-release.md`.

## Objective

Закрити незавершену сесію 2026-10-20 (PR #80 — технічна частина P-019) і зібрати наступні дрібні фічі людини.
Успіх: PR #80 на проді, план нових фіч з рішеннями людини.

## Current state (ви тут)

- Локальний `main` був позаду `origin/main` на 24 коміти — підтягнуто; сесія 2026-10-20 не мала хендофа.
- PR [#80](https://github.com/RenJeka/olx-dashboard/pull/80) злито (людина, `! gh pr merge 80 --merge`), merge-коміт
  `32d8423`; Render `olx-dashboard-api` і `olx-dashboard` — `live` на `32d8423`; CI `main` ✅; `npm run smoke` ✅.
- План [base-criteria-polish](../plans/old/base-criteria-polish.md) ✅ і в `old/` (коміт `6da05e5` у PR #80).
- Новий активний план [category-filter-counts](../plans/category-filter-counts.md) — код ще не почато.
- Локальна БД (робочий ПК) — свіжа копія проду від 2026-10-22 (`npm run db:copy-prod`); попередня —
  `server/data/olx-bak-2026-10-22T11-14-29-068Z.db`.
- Документація закриття — гілка `docs/close-2026-10-22` → PR у `main` (злиття = деплой, зливає людина).
- Агент лишив фоновий `npm run dev` (запущений у цій сесії) — зупиниться разом із сесією; якщо порти зайняті —
  [local-dev-port-busy](../instructions/local-dev-port-busy.md).

## Decisions (і чому)

Людина:
- Ручні test-cases 1–5 PR #80 — пройдено (локально, копія проду). Реліз одразу після них («так 1–3»).
- Наповнення базових наборів на проді (колишній «наступний крок») уже зроблено людиною — пункт знято.
- **Точні числа в планах дозволені** (активних і архівних); заборона лишається для іншої живої документації —
  `docs/rules.md` п. 2 оновлено.
- Лічильники фільтра «Категорії»: **1А** число біля категорії = скільки покаже таблиця, якщо обрати її (решта
  фільтрів і перемикачі шуму враховані), сума коренів = «Всього»; **2А** число OLX — у підказці; **3А** «Всього»
  більше, розбивка «з N у базі / приховано» — **у підказці**, не рядком під числом; **4А** одна кнопка-перемикач
  «Згорнути / розгорнути все».
- Тест локально через свіжу копію проду (Т-А), а не ручне додавання пунктів.
- Робота над лічильниками — новою сесією.

Агент:
- Причина розбіжності «Всього» 546 vs сума категорій ≈ 1 375 («mac mini»): лічильник категорії рахує всі
  оголошення в БД, «Всього» — після `filtered_out` і `ai_relevant = 0` (`passesNoiseFilters`). Упевненість висока.
- Зауваження CodeRabbit «прибрати кількість з плану» — не виконано за рішенням людини (див. вище).

## Dead ends — не повторювати

- **Platform API-токен Turso (`claude-code-work`, `scopes: read`) як `PROD_DB_TOKEN`** → `401`; потрібен токен
  бази → [turso-db-token-vs-api-token](../instructions/turso-db-token-vs-api-token.md).
- **`gh pr merge` агентом** — auto-mode блокує як Production Deploy навіть після «так» → людина зливає сама
  ([github-cli](../instructions/github-cli.md)).
- **Зупинка фонового `npm run dev` інструментом задач** лишила `vite`/`tsx` на 5173/3001 → зупинено за PID
  ([local-dev-port-busy](../instructions/local-dev-port-busy.md)).
- **Базових пунктів локально «немає»** — не баг: стара копія БД (2026-10-16) до наповнення наборів; «Оновити дерево
  категорій» додає лише дерево, автокатегорію пошуку перераховує скан або «Зберегти» у фільтрах.

## Artifacts

- `32d8423` (merge PR #80) — на проді, фінал.
- `6da05e5` — план base-criteria-polish ✅ в `old/`, `docs/rules.md` п. 2 (числа в планах).
- `docs/plans/category-filter-counts.md` — активний план (у PR закриття).
- Гілки `feat/base-criteria-polish`, `docs/close-2026-10-16` — злиті, не видалені.
- `server/data/olx-bak-2026-10-22T11-14-29-068Z.db` — бекап локальної БД перед копією (gitignored).
- Turso: API-токен `claude-code-work` (людина створила; для копії не підходить) і токен бази для копії — у людини.

## Verbatim essentials

- Перша спроба копії: `Копіювання впало: SERVER_ERROR: Server returned HTTP status 401` → `olx.db` 0 байт,
  відновлено `Move-Item -Force …olx-bak-2026-10-22T11-10-16-633Z.db …olx.db`.
- Успішна копія: `projects: 3, searches: 4, listings: 18319, scan_runs: 34, app_logs: 4, olx_categories: 1182,
  base_criteria: 1181`.
- Автокатегорія «mac mini» локально: Електроніка → Планшети / ел. книги та аксесуари → Планшетні комп'ютери → Apple
  (відома проблема P-020).
- Код лічильників: `web/src/components/searches/local-filters/CategoryFilter.tsx`, `web/src/hooks/useCategoryTree.ts`,
  `web/src/utils/categoryCounts.ts`, `web/src/utils/localFilters.ts` (`evaluateLocalFilters`),
  `web/src/utils/listingVisibility.ts` (`passesNoiseFilters`), «Всього» — `SearchFiltersDrawer.tsx`. У `web/` немає Vitest.
- Живі запити до OLX агентом: 0 («Оновити дерево категорій» локально запускала людина). Платних AI-викликів: 0.

## Working preferences

- Рішення — кодами варіантів («1А 2А 3А 4А», «Т-А», «так 1–3»).

## Open items

- **Next step:** реалізувати [category-filter-counts](../plans/category-filter-counts.md) (кроки 1–6) у гілці від `main`.
- **Then:** P-019 (решта), P-020, P-018; PR #75 (Dependabot, з 2026-10-16).
- **Unresolved questions (чекають людину):** злиття PR закриття; бекапи `server/data/olx-bak-*.db`; чи потрібен
  API-токен `claude-code-work`.
- **Blocked:** —

## Що змінилося в документації

- Інструкції: нова [turso-db-token-vs-api-token](../instructions/turso-db-token-vs-api-token.md); доповнено
  [github-cli](../instructions/github-cli.md) (`gh pr merge`), [local-dev-port-busy](../instructions/local-dev-port-busy.md)
  (залишки фонового dev); [development](../development.md) §4 — посилання.
- `docs/rules.md` п. 2 — числа в планах дозволені.
- Парковка: — · закриті: — (P-019 — технічну частину зроблено, решта лишається).
- Плани: новий [category-filter-counts](../plans/category-filter-counts.md); [base-criteria-polish](../plans/old/base-criteria-polish.md) ✅ в `old/`.
- Скіли: —

## Suggested opening prompt

> Почни зі скіла session-start. Далі — план docs/plans/category-filter-counts.md (лічильники у фільтрі «Категорії»
> шухляди «Локальні фільтри»; рішення вже прийняті: 1А 2А 3А-через-підказку 4А). Створи гілку від main, реалізуй
> кроки 1–6, прожени npm run check і npm run build, потім дай мені ручні test-cases. Локальна БД — свіжа копія
> проду від 2026-10-22, пошук для перевірки — «mac mini». Платних AI-дій не потрібно.
