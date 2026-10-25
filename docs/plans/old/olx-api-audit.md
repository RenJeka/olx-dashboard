# Аудит запитів до OLX: скрипт і скіл (P-017)

> **Статус:** ✅ виконано (2026-10-25) · джерело — P-017 (закрито в парковці) · доручення людини 2026-10-23 · кроки 1–6 — коміт `ed25ca3`, контрольний прогін агентом — усі ✅ · ручні test-cases 1–2 пройдено людиною 2026-10-25

## Контекст

Про зміни на боці OLX ми дізнаємось випадково (2026-10-17: REST facet категорій мовчки віддавав `403`). Потрібна
одна команда, що проходить по всіх запитах застосунку до OLX і показує: живий (HTTP-статус, тип відповіді) і чи
збігається структура з еталоном. Розбіжність — сигнал, що OLX щось змінив.

Запити застосунку (REST `/api/v1/offers/metadata/search/` більше не використовується — у аудит не входить):

| # | Запит | Код | Що звіряємо |
| --- | --- | --- | --- |
| 1 | GraphQL пошук (`ListingSearchQuery`) | `scraper/graphql/client.ts` | статус, `errors[]`, шляхи полів відповіді |
| 2 | GraphQL facet категорій (`CategoryFacetQuery`) | `scraper/graphql/categories.ts` | статус, `errors[]`, шляхи полів |
| 3 | HTML сторінки пошуку (fallback, вимкнено) | `scraper/olxFetcher.ts` | статус; при `200` — чи є картки (`SELECTORS.card`) |
| 4 | HTML сторінки оголошення (verify-проба) | `scraper/verifier.ts` | статус; при `200` — чи є опис (`SELECTORS.detailDescription`) |

Еталон — JSON-знімок (статус, тип відповіді, шляхи полів / ознаки розмітки) у репозиторії; оновлюється прапорцем
`--update` лише після рішення людини. Ввічливість — як звичайний скан: послідовно, пауза 1–2 с, перед 4-м запитом —
пауза батча (`AGENTS.md` → «Інваріанти»). URL оголошення для запиту 4 — з відповіді запиту 1 (без БД).

## Файли

- `server/src/scraper/audit.ts` — проби й чисті функції (шляхи полів, порівняння з еталоном).
- `server/src/scraper/audit.test.ts` — тести чистих функцій.
- `server/src/scraper/olxAuditEtalon.json` — еталон.
- `server/src/cli/olxAudit.ts` — CLI: таблиця, код виходу `1` при розбіжності; `--update`, `--query`.
- `package.json`, `server/package.json` — `npm run olx:audit`.
- `docs/instructions/olx-api-audit.md` — процедура; `skills/olx-api-audit/SKILL.md` — скіл вказує на неї;
  `skills/skills.json` + `npm run skills:sync`.
- Доки: `AGENTS.md` (команди), `docs/olx-api.md` (§5 чекліст, §6 журнал), `docs/architecture.md`,
  `docs/structure.md`, `docs/instructions/README.md`, `docs/parking.md` (прибрати P-017).

## Кроки

- [x] 1. `scraper/audit.ts` + тести чистих функцій.
- [x] 2. `cli/olxAudit.ts`, скрипти `olx:audit`.
- [x] 3. Перший живий прогін (4 запити до OLX) → `--update` — початковий еталон.
- [x] 4. Інструкція + скіл + `skills:sync`.
- [x] 5. Доки; P-017 — з парковки.
- [x] 6. `npm run check`, `npm run build`.

## Test-cases (людина)

| # | Що зробити | Що маєш побачити |
| --- | --- | --- |
| 1 | У терміналі в `C:\GIT\olx-dashboard` виконай `npm run olx:audit` | Таблиця з 4 рядків (GraphQL пошук, GraphQL категорії, HTML пошук, HTML оголошення): статус, тип, «збігається з еталоном» — у всіх ✅; код виходу 0 |
| 2 | В агента попроси «перевір API OLX» | Агент запускає скіл `olx-api-audit` і показує ту саму таблицю з висновком |
