# Handoff: стабільність S6 → S4 → аудит доків → S14/S16 → легка таблиця

2026-10-04 · сесія (2026-10-03…04): S6 (npm audit) → S4 (HTML-fallback вимкнено) → аудит документації + скіл
`docs-audit` → S14 (великий пошук на проді) → S16 (збереження фільтра) → B2-легка (`/listings` без важких полів).
Попередній handoff — `docs/handoffs/2026-10-03-session-harness-and-s9.md`.

## Objective

Порядок людини: S6 → S4 → S14 → S10 → харнес H3–H6; посеред сесії людина додала аудит документації (одразу
після S4). Критерій — кожен пункт або закрито на проді, або записано з рішенням людини.

## Current state (ви тут)

- `main` = `96e049c` (PR #45) + PR закриття цієї сесії. Обидва сервіси Render — `live` на `96e049c`.
- Закрито: S4, S6, S14, S16, аудит документації; S15 ⏸ (до P-005); S8 → P-007.
- Відкрито: **S17** — великий пошук усе ще повільний (~20 с на `/listings`, ~17 с на пошук в описі), рішення
  людини — спершу заміряти етапи (варіант «а»). Далі S10, потім H3–H6.

## Decisions (і чому)

- **S6 — `npm audit fix` без `--force`** (людина): лишився `uuid` через `exceljs`; `exceljs` викликає лише
  `uuid.v4()` без `buf`, а `--force` відкотив би `exceljs` до несумісної версії.
- **S4 — HTML-fallback вимкнено** (людина, варіант 1): CloudFront віддає 403 на будь-яку HTML-сторінку з Node;
  перемикач `HTML_FALLBACK_ENABLED`, код лишився; ідея обходу — P-005. Запити з проду не робили — той самий Node.
- **S15 — verify-проба теж 403** → відкладено разом із P-005 (людина).
- **Аудит документації** (людина): неактуальне видалено, закриті плани в `old/`, правило «жодних кількостей»
  у `rules.md`, скіл `docs-audit`; Antigravity людина не використовує → ручні перевірки прибрано, автогенерацію
  `.agents/` відкладено (P-009, варіант «б»). S8 → P-007, S11 видалено.
- **Без помітки Claude Code** і в PR, і в комітах (людина) → `rules.md` → «Git».
- **S16 (людина: «A»)**: `filtered_out` пишеться лише для змінених рядків, порціями (`dbBatchChunked`); перерахунок
  читає лише поля активних правил. `statusEngine` — навмисно один атомарний batch (зауваження CodeRabbit: порції
  дали б хибні промахи при частковому збої).
- **S14 → B2-легка** (людина; повна пагінація — P-008): `/listings` без повного опису й галереї, фрагмент опису від
  сервера, деталі на вимогу; пошук в описі — на сервері (людина: варіант «а»).
- **S17 — варіант «а»** (людина): спершу заміряти етапи, потім варіанти.
- **Тести:** прибирання тимчасової БД стійке до `EBUSY`; `docs:check` вважає хендофи знімками, посилання на план,
  який пізніше заархівовано, валідне.

## Dead ends — не повторювати

- **HTML OLX із заголовками Chrome / іншими адресами:** однаково 403 (CloudFront). Подробиці — `docs/olx-api.md` §6.
- **«Один гігантський batch — єдина причина S16»:** після фіксу повторне збереження знову падало — перерахунок
  тягнув повні описи всіх рядків.
- **Порції для `statusEngine`:** відкочено — ламає атомарність вікна покриття.
- **Очікування «легка відповідь = швидко»:** пам'ять упала, час — ні (S17).
- **Моє «повний `npm test` чистий» про EBUSY** — хибно, падав і повний прогін; виправлено кодом.
- **`node -e` з бектиками/`\n` у bash** → `docs/instructions/node-e-escaping.md`.
- **Кирилиця в `curl -d`** → `docs/instructions/curl-cyrillic-body.md`.

## Artifacts

- PR #40 (S6), #41 (S4), #42 (аудит + скіл), #43, #44 (S16), #45 (B2-легка) — злиті, на проді.
- `server/src/scraper/refilter.ts`, `dbBatchChunked` у `db/db.ts`, `server/src/routes/listings.ts` (легкі рядки,
  `/details`, `/listings/search`), `web/src/hooks/useDebouncedValue.ts` — у проді.
- Плани в `old/`: `docs-audit`, `docs-harness`, `session-harness`, `vitest-setup`, `listings-light-payload`.
- Гілки PR не видалялись.

## Verbatim essentials

- Пошук `iphone` на проді — `search_id = 4`, ~14 тис. оголошень (знімок 2026-10-04).
- Заміри на проді (Render): до B2 — `GET /api/searches/4/listings` ~21,5 с, пам'ять API пік 423–439 МБ з 512;
  після B2 (2026-10-04 10:51–10:55 UTC) — `/listings` 20,1 с, пам'ять пік ~320 МБ, `/listings/search` 17–18 с;
  запити «чо» й «чохол» пішли обидва (пауза 400 мс). Запит `SELECT … FROM listings WHERE search_id=?` у
  статистиці Turso — ~1,2 с.
- S16: `PATCH /api/searches/4` → 500, лог `TypeError: fetch failed` (scope `http`).
- CloudFront: `server=CloudFront`, `x-cache=Error from cloudfront`, «403 ERROR — The request could not be satisfied».
- Render workspace `tea-d8mh9lrbc2fs73dvtbv0`; API `srv-d8ujfrnlk1mc73fuberg`, фронт `srv-d8ujhi1o3t8c73drge0g`.

## Working preferences

- Зливати PR агент може після зеленого CI, коли людина сказала «так» саме на цей PR (злиття = деплой).
- Варіанти з рекомендацією, простими словами; перед запусками на проді — що саме й чекати «так».

## Open items

- **Next step:** S17 (варіант «а») — заміряти етапи `GET /listings` і пошуку в описі на проді
  (`docs/plans/stability-baseline.md` → S17).
- **Then:** S10 (пояснити простими словами, рішення людини) → H3–H6 (`dev-deploy-harness.md`).
- **Unresolved questions (чекають людину):** «модель JEV»; `OPENROUTER_API_KEY` локально; коли видаляти бекап-гілку
  Turso; скіл із `prod-scan-monitoring`.
- **Не проганявся:** test-case «AI-майстер, крок перегляду — описи видно» (`plans/old/listings-light-payload.md`).

## Що змінилося в документації

- Інструкції: нові `docs-audit`, `node-e-escaping`, `curl-cyrillic-body`.
- Парковка: нові P-005, P-006, P-007, P-008, P-009 · закриті: —.
- Плани: ✅ і в `old/` — `docs-audit`, `docs-harness`, `session-harness`, `vitest-setup`, `listings-light-payload`.
- Скіли: новий `docs-audit`.
- Правила: «жодних кількостей» (`rules.md` п. 2); без помітки Claude Code у комітах.

## Suggested opening prompt

> /session-start. Почнемо з S17 (варіант «а»): запропонуй, що саме заміряємо на проді (тимчасові логи
> етапів `/listings` і пошуку в описі), і чекай мого «так».
