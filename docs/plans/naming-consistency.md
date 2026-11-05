# Узгодження найменування

> **Статус:** 🟢 активний · очікує підтвердження людини

**Контекст.** Аудит за скілом `naming-consistency-audit` — [`naming-audit/audit.md`](../naming-audit/audit.md).
Перейменування без зміни поведінки; кожна порція — окремий коміт `naming: <старе> → <нове>`, після кожної —
`npm run check`.

## Порція 1 — низький ризик (локальні змінні)

- [ ] `description_preview` → `descriptionPreview` · `server/src/services/listings.ts` · назовні нічого
- [ ] `local_filters` → `localFilters` · `web/src/utils/localFilters.ts`, `SearchFiltersDrawer.tsx` · поле DTO лишається `local_filters`
- [ ] `stale_count`, `verify_candidates` → `staleCount`, `verifyCandidates` · `web/src/utils/searchStats.ts` · поля DTO лишаються

## Порція 2 — середній (функції репозиторіїв)

- [ ] `getSearch` (repos/analysis) → `getSearchAnalysisRow` · 33 згадки · ризик: сплутати з `services/searches.getSearch` — міняти лише імпорти з `db/repos/analysis`
- [ ] `loadListings` → `listAnalysisListings` · 16 згадок
- [ ] `loadPickCandidates` → `listPickCandidates` · 6 згадок + `ai-flow.md`, `architecture.md`, `structure.md`
- [ ] `getLatestScanStatus` → `getLastScanStatus`, `getLatestAnalysis` → `getLastAnalysisRun` · 6 згадок

## Порція 3 — вищий (файли й підписи UI)

- [ ] `AiRankCard` → `AiPickCard` (`git mv` файлу) · 4 згадки + `docs/structure.md`
- [ ] «Відмінити» → «Скасувати» · 2 кнопки
- [ ] «Копіювати» → «Скопіювати» · 1 кнопка

## Завершення

- [ ] Посібник із домовленостями й словником — новий файл `naming.md` у `docs/` (скіл просить `NAMING.md`; ім'я в нижньому регістрі за `rules.md`), посилання з `AGENTS.md` (карта документації) і `docs/structure.md`
- [ ] Статус ✅, `git mv` у `docs/plans/old/`

## Test-cases

- `npm run check` і `npm run build` зелені після кожної порції.
- Ручні (UI): «AI Вибір» → «Запустити AI ранжування» → картки обраних оголошень показуються як раніше.
  Діалог синонімів пошуку і крок «Записати в таблицю» майстра аналізу — кнопка «Скасувати» закриває діалог.
