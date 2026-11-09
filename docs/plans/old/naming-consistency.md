# Узгодження найменування

> **Статус:** ✅ виконано (2026-11-05) · ручні UI test-cases (AI Вибір, кнопки «Скасувати») не виконані — перевірити людині

**Контекст.** Аудит за скілом `naming-consistency-audit` — [`naming-audit/audit.md`](../../naming-audit/audit.md).
Перейменування без зміни поведінки; кожна порція — окремий коміт `naming: <старе> → <нове>`, після кожної —
`npm run check`.

## Порція 1 — низький ризик (локальні змінні)

- [x] `description_preview` → `preview` (ім'я `descriptionPreview` зайняте функцією) · `server/src/services/listings.ts` · назовні нічого
- [x] `local_filters` → `localFilters` / `filters` · `web/src/utils/localFilters.ts`, `SearchFiltersDrawer.tsx` · поле DTO лишається `local_filters`
- [x] `stale_count`, `verify_candidates` → `staleCount`, `verifyCandidates` · `web/src/utils/searchStats.ts` · поля DTO лишаються

## Порція 2 — середній (функції репозиторіїв)

- [x] `getSearch` (repos/analysis) → `getSearchAnalysisRow` · 33 згадки · ризик: сплутати з `services/searches.getSearch` — міняти лише імпорти з `db/repos/analysis`
- [x] `loadListings` → `listAnalysisListings` · 16 згадок
- [x] `loadPickCandidates` → `listPickCandidates` · 6 згадок + `ai-flow.md`, `architecture.md`, `structure.md`
- [x] `getLatestScanStatus` → `getLastScanStatus`, `getLatestAnalysis` → `getLastAnalysisRun` · 6 згадок

## Порція 3 — вищий (файли й підписи UI)

- [x] `AiRankCard` → `AiPickCard` (`git mv` файлу) · 4 згадки + `docs/structure.md`
- [x] «Відмінити» → «Скасувати» · 2 кнопки
- [x] «Копіювати» → «Скопіювати» · 1 кнопка

## Завершення

- [x] Посібник — [`naming.md`](../../naming.md) (скіл просить `NAMING.md`; ім'я в нижньому регістрі за `rules.md`), посилання з `AGENTS.md` і `structure.md`
- [x] Статус ✅, `git mv` у `docs/plans/old/`

## Test-cases

- `npm run check` і `npm run build` зелені після кожної порції.
- Ручні (UI): «AI Вибір» → «Запустити AI ранжування» → картки обраних оголошень показуються як раніше.
  Діалог синонімів пошуку і крок «Записати в таблицю» майстра аналізу — кнопка «Скасувати» закриває діалог.

## Додано за рішенням людини

- [x] «проект» → «проєкт» — UI, коментарі, живі документи
- [x] `deleteAllLogs` → `clearLogs` (сервіс), `clearLogs` → `clearLogRows` (репо)
