# План: пагінація таблиці оголошень (фікс зависання UI після глибокого скану)

Статус: ✅ реалізовано (код + документація). Залишилось: ручна перевірка test-cases користувачем.
Гілка: `feat/mvp-stage-1`

## Контекст і діагноз

**Симптом:** після глибокого скану (до ~2000 оголошень у пошуку) фронтенд сильно зависає при відкритті/скролі таблиці.

**Причина:** `web/src/components/table/ListingsTableBody.tsx` рендерить **усі** рядки з `table.getRowModel().rows` без пагінації чи віртуалізації. Кожен рядок — 8 комірок з Chakra-компонентами (`Image`, `Tooltip`, `Link`, `Badge`), тобто десятки тисяч DOM-вузлів. Підсилювач: у `web/src/pages/ListingsTable.tsx` стоїть `columnResizeMode: 'onChange'` — під час ресайзу колонки всі рядки ре-рендеряться на кожен піксель руху миші.

**Обране рішення:** клієнтська пагінація через вбудований `getPaginationRowModel()` TanStack Table v8 — нуль нових залежностей, DOM завжди обмежений розміром сторінки. Додатково: `columnResizeMode: 'onEnd'` і `React.memo` на рядок.

**Відхилені альтернативи (не реалізовувати):**
- Віртуалізація (`@tanstack/react-virtual`) — нова залежність, погано дружить зі змінною висотою рядків (`lineClamp(3)` в колонці «Опис»).
- Лише мемоїзація — не рятує: перший рендер 2000 рядків у DOM усе одно повільний.

## Файли

- `web/src/pages/ListingsTable.tsx` — підключити пагінацію, `onEnd`, відрендерити `TablePagination`.
- `web/src/hooks/useListingsTableState.ts` — додати стан `pagination`.
- `web/src/utils/storage.ts` — персист `pageSize` у localStorage.
- `web/src/components/table/ListingsTableBody.tsx` — `React.memo` на рядок.
- **Новий:** `web/src/components/table/TablePagination.tsx`.

## Кроки

### 1. Стан пагінації

- [x] У `useListingsTableState` додано `pagination: PaginationState` (`{ pageIndex, pageSize }`) + `setPagination`, поряд з наявними `sorting`/`columnSizing`. Дефолт `pageSize: 50` (через `DEFAULT_PAGE_SIZE` у `storage.ts`), `pageIndex: 0`.
- [x] `pageSize` персистується в localStorage — додано поле `pageSize` до `StoredTableState`/`loadTableState`/`saveTableState` (`TABLE_STORAGE_KEY`, той самий ключ, що й `sorting`/`columnSizing`). `pageIndex` НЕ персистується.
- [x] У `ListingsTable.tsx` додано `getPaginationRowModel: getPaginationRowModel()`, `state.pagination`, `onPaginationChange: setPagination`. `autoResetPageIndex` лишено дефолтним (`true`) — TanStack сам скидає сторінку при зміні `data` (нова `searchId`) і при зміні сортування.

### 2. Компонент TablePagination

- [x] Створено `web/src/components/table/TablePagination.tsx`: Chakra UI v3 `Pagination.Root` + `Pagination.PrevTrigger`/`Pagination.Items`/`Pagination.NextTrigger` у `ButtonGroup` (іконки `LuChevronLeft`/`LuChevronRight`), номери сторінок з підсвіткою активної.
- [x] Селектор розміру сторінки 25 / 50 / 100 / 200 — `NativeSelect.Root`/`Field`/`Indicator`.
- [x] Текст діапазону українською через `Pagination.PageText format={...}`: «1–50 з 1 987» (`toLocaleString('uk-UA')`).
- [x] Рендериться у `ListingsTable.tsx` під `Table.Root`, поза скрол-областю (окремий `Flex` з `flexShrink={0}` та верхньою рамкою) — завжди видимий. Прихований, якщо `getPrePaginationRowModel().rows.length <= 25`.

### 3. Ре-рендер-фікси

- [x] `ListingsTable.tsx`: `columnResizeMode: 'onChange'` → `'onEnd'`.
- [x] `ListingsTableBody.tsx`: `<Table.Row>` з комірками винесено в `ListingsTableRow`, обгорнутий `React.memo`.

### 4. Документація

- [x] Оновлено `docs/architecture.md` (пагінація таблиці, новий компонент, `onEnd`, memo рядка, `pageSize` у storage).
- [x] Оновлено `docs/structure.md` (новий файл `TablePagination.tsx`, уточнення по існуючих).
- [x] Проставлено чекбокси прогресу в цьому файлі.

## Інваріанти / обмеження

- Стек незмінний: React 18 + TanStack Table v8 + Chakra UI v3. **НЕ додавати нових npm-залежностей.**
- UI-текст українською, код/ідентифікатори англійською. TypeScript strict, без `any`.
- Серверну частину та API **не чіпати** — пагінація суто клієнтська.
- Playwright не запускати — UI перевіряє користувач за чеклістом нижче.

## Test-cases (перевіряє користувач вручну)

- [ ] Пошук з ~2000 оголошень відкривається миттєво, скрол плавний.
- [ ] Перемикання сторінок працює; текст «N–M з T» коректний.
- [ ] Зміна pageSize зберігається після перезавантаження сторінки; pageIndex після перезавантаження = перша сторінка.
- [ ] Сортування скидає на 1-шу сторінку і застосовується до всього набору, не лише до поточної сторінки.
- [ ] Зміна пошуку зліва скидає на 1-шу сторінку.
- [ ] Ресайз колонок не лагає (ширина застосовується після відпускання миші).
- [ ] Ховання/показ колонок у Drawer налаштувань працює як раніше.
- [ ] Пошук з малою кількістю оголошень (≤ 25) — панель пагінації прихована.
