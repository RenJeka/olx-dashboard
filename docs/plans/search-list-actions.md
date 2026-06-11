# План: модалка опису, видалення пошуку, ручне сортування пошуків

Статус: ✅ завершено.
Гілка: `feat/mvp-stage-1`

## Контекст

Три незалежні UX-покращення:

1. Колонка «Опис» зараз — `lineClamp(3)` без жодної взаємодії (`web/src/components/table/columns.tsx:55-70`). Потрібен повний перегляд: hover-тултіп зі скролом + клік → модальне вікно, з можливістю вимкнути цю поведінку в налаштуваннях.
2. `DELETE /api/searches/:id` існує, але **без каскаду** — при `foreign_keys = ON` (`db.ts:17`) видалення впаде з FK constraint, бо `listings`/`scan_runs`/`price_history` досі посилаються на search. У UI взагалі немає кнопки видалення.
3. У `searches` немає поля порядку — список завжди `ORDER BY created_at DESC`. Потрібне ручне сортування. Chakra UI v3 не має вбудованого drag-n-drop і в проєкті немає DnD-залежностей — реалізуємо стрілками ↑/↓ (без нових пакетів).

## Файли

- **Новий:** `web/src/components/ui/dialog.tsx` — Chakra v3 Dialog wrapper (патерн `drawer.tsx`).
- **Новий:** `web/src/components/DescriptionDialog.tsx`.
- `web/src/components/table/columns.tsx`, `ListingsTableBody.tsx`, `pages/ListingsTable.tsx`, `App.tsx`, `SettingsDrawer.tsx`, `utils/storage.ts` — опис (тултіп/модалка/налаштування).
- `web/src/pages/Searches.tsx`, `web/src/api/client.ts`, `web/src/types/index.ts` — 3-dot меню, видалення, стрілки сортування.
- `server/src/routes/searches.ts`, `server/src/db/schema.sql`, `server/src/db/db.ts`, `server/src/types.ts` — каскадний DELETE, `sort_order`, `/move`.

## Кроки

### 1. Опис: тултіп + модальне вікно + налаштування

- [x] Новий UI-примітив `web/src/components/ui/dialog.tsx` (Chakra v3 Dialog: `DialogRoot`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogBody`, `DialogFooter`, `DialogCloseTrigger`, `DialogBackdrop`).
- [x] `storage.ts`: `loadDescriptionExpandEnabled()` / `saveDescriptionExpandEnabled()` — поле `descriptionExpandEnabled` у `SETTINGS_STORAGE_KEY` (default `true`).
- [x] `App.tsx`: стан + persist, передати в `ListingsTable` і `SettingsDrawer`.
- [x] `SettingsDrawer.tsx`: `Switch` «Розширений перегляд опису (тултіп + модалка)».
- [x] `ListingsTableBody.tsx`: пропси `descriptionExpandEnabled`, `onOpenDescription` крізь `ListingsTable → ListingsTableBody → ListingsTableRow`; для `description`-комірки — `Tooltip interactive` (скрол) + клік → модалка.
- [x] `DescriptionDialog.tsx`: фото + назва + ціна в хедері, повний опис у тілі (скрол), «Відкрити на OLX» у футері.
- [x] `npm run build` (web).

### 2. Видалення пошуку

- [x] `server/src/routes/searches.ts`: каскадний `DELETE` у транзакції — `price_history` → `scan_runs` → `listings` → `searches`.
- [x] `client.ts`: `useDeleteSearch()`.
- [x] `Searches.tsx`/`App.tsx`: `onSelect: (id: number | null) => void`, скидання вибору при видаленні активного пошуку.
- [x] `SearchRow`: 3-dot меню (`Menu.Root`, іконка `LuEllipsisVertical`) — Сканувати / Глибокий скан / Видалити (`colorPalette="red"`).
- [x] Діалог підтвердження видалення (`role="alertdialog"`).
- [x] `npm run build` (web + server).

### 3. Ручне сортування пошуків (стрілки ↑/↓)

- [x] `schema.sql`: `sort_order INTEGER` у `searches`.
- [x] `db.ts`: `addColumnIfMissing` + одноразовий backfill (`0..N-1` за `created_at DESC, id DESC`).
- [x] `searches.ts`: `GET` → `ORDER BY sort_order ASC, created_at DESC, id DESC`; `POST` → новий `sort_order = MIN(sort_order) - 1`; новий `POST /api/searches/:id/move` (`{direction}`) — swap сусідніх `sort_order` у транзакції.
- [x] `types/index.ts`: `sort_order: number` у `Search`.
- [x] `client.ts`: `useReorderSearches()`.
- [x] `SearchRow`: кнопки `LuChevronUp`/`LuChevronDown`, disabled на краях списку.
- [x] `npm run build` (web + server).

### 4. Фінал документації

- [x] Оновити `docs/architecture.md`/`docs/structure.md` (новий ендпойнт `/move`, нові файли, колонка `sort_order`).
- [x] `docs/plans/TODO`: позначити `[x]` пункти «опис»/«видалення пошуку».
- [x] Проставити чекбокси прогресу в цьому файлі.

## Примітки після завершення

- `ListingsTableBody.tsx` рефакторено на три файли: `ListingsTableBody.tsx` (тільки `<tbody>`,
  мапить рядки), `ListingsTableRow.tsx` (рядок, `React.memo`) і `DescriptionTooltip.tsx`
  (тултіп+клік для опису) — логіка з кроку 1 не змінилась, лише винесена в окремі компоненти.
- Виявлено під час ручної перевірки: zag-js Tooltip має `closeOnScroll: true` за замовчуванням
  і вішає capture-listener на `scroll` для всього документа — скрол усередині самого тултіпа
  (контент у `Portal`) теж закривав його, незважаючи на `interactive`/`closeDelay`. Виправлено
  додаванням `closeOnScroll={false}` у `DescriptionTooltip.tsx`. `closeDelay` піднято до `500`.

## Test-cases (перевіряє користувач вручну)

- [ ] Опис: hover показує тултіп з повним текстом і скролом для довгих описів; клік відкриває модалку з фото/ціною/посиланням; вимкнення в налаштуваннях повертає старий вигляд (без тултіпа/кліку).
- [ ] Видалення: підтвердження, після видалення пошук і всі його оголошення зникають з БД (перевірити перезапуском), якщо видалили активний пошук — права панель повертається в стан "обери пошук".
- [ ] Сортування: стрілки міняють місцями сусідні пошуки, порядок зберігається після перезавантаження сторінки; крайні елементи мають вимкнені відповідні стрілки; новий пошук з'являється згори.

## Інваріанти / обмеження

- Стек незмінний: React 18 + TanStack Table v8 + Chakra UI v3 + better-sqlite3. **НЕ додавати нових npm-залежностей** (DnD — свідомо відхилено на користь стрілок).
- UI-текст українською, код/ідентифікатори англійською. TypeScript strict, без `any`.
- Playwright не запускати — UI перевіряє користувач за чеклістом вище.
