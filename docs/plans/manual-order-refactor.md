# Ручний порядок: один механізм замість близнюків

> **Статус:** 🟢 активний

**Контекст.** Аудит — [`refactor-audit/audit.md`](../refactor-audit/audit.md). Рефакторинг без зміни поведінки:
ручний порядок проєктів і пошуків переходить на спільний модуль `server/src/db/repos/manualOrder.ts`.

**Файли:** `server/src/db/repos/manualOrder.ts` (новий), `server/src/db/repos/projects.ts`,
`server/src/db/repos/searches.ts`, `server/src/services/projects.ts`, `server/src/services/searches.ts`,
`server/src/routes/searches.test.ts`, `server/src/db/repos/manualOrder.test.ts` (новий).

## Порція 0 — страховка

- [x] Характеризаційні тести: пошук у проєкті рухається лише серед пошуків того ж проєкту, на краю — без змін («новий згори» вже покритий)

## Порція 1 — середній ризик (експортовані функції репозиторіїв)

- [ ] Додати `manualOrder.ts`: `ManualOrderList`, `isDirection`, `nextTopSortOrder`, `moveOneStep` + юніт-тести
- [ ] `PROJECT_ORDER` / `SEARCH_ORDER` у репозиторіях сутностей; сервіси `createProject`, `moveProject`, `createSearch`, `moveSearch` — на нові примітиви
- [ ] Видалити `min*SortOrder`, `get*Position`, `find*Neighbor`, `swap*SortOrder`, тип `SearchPosition` · викликачів поза сервісами немає

## Завершення

- [ ] `docs/module-design.md` (скіл просить `MODULE-DESIGN.md`; ім'я в нижньому регістрі за `rules.md`), посилання з `AGENTS.md`
- [ ] `docs/architecture.md`, `docs/structure.md` — новий файл репозиторію
- [ ] Статус ✅, `git mv` у `docs/plans/old/`

## Test-cases

- `npm run check` і `npm run build` зелені.
- Ручні (UI): у лівій панелі стрілки «Пересунути вгору» / «Пересунути вниз» біля пошуку і «Пересунути проєкт вгору» /
  «Пересунути проєкт вниз» біля проєкту міняють порядок; кнопка «Новий пошук» додає пошук першим у «Без проєкту».
