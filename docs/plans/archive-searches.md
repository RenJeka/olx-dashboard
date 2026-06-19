# План: архів пошуків

## Контекст
Старі пошуки накопичуються в лівій панелі. Треба мати змогу архівувати пошук
(прибрати зі списку активних) та окрему секцію «Архів», яка показує архівовані.

## Рішення
- `searches.archived INTEGER DEFAULT 0` — прапорець архіву.
- GET `/api/searches` повертає всі (з `archived`); фронт ділить на активні/архівні.
- Архівування — через наявний PATCH `/api/searches/:id` (поле `archived`).
- Ліва панель: окрема акордеон-секція «Архів (N)» (згорнута), у 3-dot меню рядка —
  «Архівувати»/«Розархівувати». Реордер (стрілки) — лише для активних
  (neighbor-запит фільтрує `archived = 0`).

## Файли
- [x] `server/src/db/schema.sql` — колонка `archived INTEGER DEFAULT 0`.
- [x] `server/src/db/db.ts` — `addColumnIfMissing('searches', 'archived', 'INTEGER DEFAULT 0')`.
- [x] `server/src/routes/searches.ts` — PATCH приймає `archived`; `/move` neighbor фільтрує `archived = 0`.
- [x] `web/src/types/index.ts` — `Search.archived: number`.
- [x] `web/src/api/client.ts` — `useArchiveSearch` (PATCH archived).
- [x] `web/src/components/Searches.tsx` — секція «Архів», пункт меню «Архівувати»/«Розархівувати»,
      активний список без архівних, стрілки реордеру лише для активних.

## Test-cases
- [x] Архівувати активний пошук → зникає зі списку «Пошуки», з'являється в «Архів».
- [x] Розархівувати → повертається у «Пошуки».
- [x] Архів порожній → секція показує «порожньо» (або прихована).
- [x] Реордер активних не зачіпає архівні.
