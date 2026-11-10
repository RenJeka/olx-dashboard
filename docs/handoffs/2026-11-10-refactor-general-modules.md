# Handoff: рефакторинг — «дещо універсальні» модулі

2026-11-10 · сесія: аудит скілом `code-modules-refactor` → план → порції 1–4 (обсяг AI-кроків, HTTP-клієнт фронтенду,
AI-маршрути сервера, конфігурація) → доки → чернетка PR → закриття сесії.
Попередній handoff — `docs/handoffs/2026-10-23-refactor-clean-architecture.md`.

## Objective

Людина: скілом `code-modules-refactor` спланувати й відрефакторити кодову базу — знайти модулі, взяти 2–3
найпоказовіші, що можна — винести у файли конфігурації. Критерій — поведінка не змінюється, кожна порція — окремий
коміт із зеленими `npm run check` і `npm run build`.

## Current state (ви тут)

- Гілка `ccr-0b71569c-84hgso` (від `main` на `1b8d4c6`), чернетка PR #91; у `main` не злито, деплою не було.
- Усі чотири порції плану виконано; план — ✅ у `docs/plans/old/refactor-general-modules.md` (там же підсумок).
- Сесія підписана на події PR #91 (CI, зауваження).
- Ручні test-cases 1–5 плану людина не проходила.

## Decisions (і чому)

- **Обсяг — усі чотири порції; коміт + push + чернетка PR** — рішення людини в діалозі.
- **Сканер і скрейпер не чіпати** — агент: їх зміни відкладено людиною (фази 5–6 `refactor-clean-architecture`);
  залишки — P-021.
- **План і звіт аудиту — один файл у `docs/plans/`**, а не `docs/refactor-audit/` зі скіла — агент: конвенція
  `AGENTS.md` → «Плани» сильніша за вподобання скіла.
- **Посібник — розділ §8 у `docs/development.md`**, а не окремий `MODULE-DESIGN.md` — агент: одне джерело про процес.
- **Коміти без позначки Claude** — `docs/rules.md` → «Git».
- **`try/catch` у AI-маршрутах з кодами 500/502 лишено** — агент: якщо кидати далі, глобальний обробник писав би їх
  у журнал `app_logs`, а це зміна поведінки.
- **`openrouter.ts` ↔ `jev.ts`, `useRelevanceFlow` ↔ `useAiPicksFlow` не зводити** — агент: спільний примітив був би
  узагальненням заради двох викликачів (розділ «Не змінюємо» плану).
- **Серверні числа винести в новий `server/src/constants.ts`** — людина підтвердила порцію 4, хоча константу з одним
  читачем це віддаляє від коду.

## Dead ends — не повторювати

- **Шляхи майбутніх файлів у бектиках у плані** — `docs:check` упав. → `docs/instructions/docs-check-future-files.md`.
- **`insertListing(…, { title })` у тесті** — заголовок не застосовується, тести падали.
  → `docs/instructions/test-insert-listing-title.md`.

## Artifacts

- PR #91 `refactor: general-purpose modules (AI scope, API client, AI route helpers, constants)` — чернетка.
- Коміти гілки: `e362ba6` план · `e13d1b2` порція 1 · `b2cd82c` порція 2 · `57e23b5` тести AI-маршрутів ·
  `01b4072` порція 3 · `a8796e6` порція 4 і доки — фінал; далі коміт закриття сесії.
- Нові файли коду: `server/src/analysis/guards.ts`, `server/src/routes/http.ts`, `server/src/constants.ts`,
  `server/src/test/zip.ts`, `server/src/routes/aiRoutes.test.ts`, `server/src/routes/http.test.ts` — фінал.
- Видалено: `web/src/hooks/analysis/useAnalysisScope.ts`.

## Verbatim essentials

- PR: https://github.com/RenJeka/olx-dashboard/pull/91
- Перевірки: `npm run check` і `npm run build` зелені до і після кожної порції; тестів сервера 280 → 317;
  `layers:check` — ті самі 8 відомих порушень у сканері й скрейпері.
- Звірка ZIP: три пакети (`relevance`, `ai-picks`, `analyze` у режимах `cons` і `pros`) на 120 оголошеннях — вміст
  до/після збігся байт-у-байт (`cmp`).
- Єдина видима різниця: невдале завантаження ZIP/xlsx на фронтенді кидає `ApiError` замість `Error` (текст той самий).
- Помічено, не змінювалось: `parseIds` перетворює `null` у списку `ids` на id `0`.

## Working preferences

- Відповіді — стисло, простою мовою, без технічних подробиць без потреби; уточнювальні питання — до детальної відповіді.
- Агентів (сабагентів) можна використовувати — дозвіл людини в цій сесії.

## Open items

- **Next step:** людина проходить ручні test-cases 1–5 плану (AI-діалоги: обсяг за замовчуванням, ZIP, xlsx) і
  вирішує про злиття PR #91 (злиття = деплой; після — `npm run smoke`).
- **Then:** P-021 разом із фазами 5–6 `refactor-clean-architecture`; далі з парковки — P-019, P-020, P-018.
- **Unresolved questions (чекають людину):** зливати PR #91 зараз чи після ручної перевірки.

## Що змінилося в документації

- Інструкції: нові `docs-check-future-files`, `test-insert-listing-title`; доповнено `api-equivalence-check`
  (звірка ZIP-відповідей).
- Парковка: новий `P-021`.
- Плани: `refactor-general-modules` — створено, ✅, у `old/`.
- Доки: `structure.md`, `architecture.md` (нові файли), `development.md` §8 «Як проєктувати модуль», `AGENTS.md` →
  «Конвенції» (рядок про модулі й конфігурацію), `current.md`.
- Скіли: нових немає.

## Suggested opening prompt

> Почни сесію (`session-start`). PR #91 (рефакторинг універсальних модулів) — чернетка: перевір CI і скажи, що лишилось
> до злиття. Ручні test-cases плану `docs/plans/old/refactor-general-modules.md` я пройшов / не пройшов: <результат>.
