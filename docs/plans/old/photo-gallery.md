# План: галерея фото в таблиці (збільшення + додаткові фото)

## Контекст
GraphQL OLX повертає масив `photos { link }` (кілька фото на оголошення), але зараз
зберігається лише перше (`photo_url`, 400x300). Треба: 1) збільшувати фото в таблиці
при наведенні; 2) показувати інші фото оголошення (прев'ю).

## Рішення
- Зберігати всі фото як JSON-масив прев'ю-лінків `listings.photo_urls` (розмір 600x450).
- `photo_url` лишається першим фото (400x300) для мініатюри в комірці.
- У комірці «Фото» — Tooltip (наведення) з великим головним фото + сіткою решти прев'ю.
  Tooltip-контент некликабельний (лише перегляд) — надійніше за hover-popover.

## Файли
- [x] `server/src/db/schema.sql` — колонка `photo_urls TEXT`.
- [x] `server/src/db/db.ts` — `addColumnIfMissing('listings', 'photo_urls', 'TEXT')`
      (після rebuild-міграції, як analysis_*).
- [x] `server/src/types.ts` — `RawListing.photoUrls?: string[]`.
- [x] `server/src/scraper/graphqlOlxFetcher.ts` — мапити всі `photos[].link` (600x450).
- [x] `server/src/scraper/normalizer.ts` — upsert `photo_urls` (JSON), HTML-fallback → null
      (не затирає наявні через COALESCE).
- [x] `server/src/routes/listings.ts` — додати `photo_urls` у `LISTING_COLUMNS`.
- [x] `web/src/types/index.ts` — `Listing.photo_urls: string | null`.
- [x] `web/src/components/table/columns.tsx` — комірка «Фото» з Tooltip-галереєю
      (новий компонент `PhotoCell`).

## Test-cases
- [x] Скан GraphQL → `photo_urls` містить кілька лінків (якщо оголошення має >1 фото).
- [x] Наведення на мініатюру → збільшене фото + сітка решти прев'ю.
- [x] Оголошення без фото → плейсхолдер, без tooltip.
- [x] Стара БД (без re-scan) → `photo_urls` NULL, fallback на збільшений `photo_url`.
