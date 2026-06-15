# План: підтримка мобільної версії розмітки (responsive layout)

> Прогрес: познач `[x]` коли пункт виконано. Легенда: `[ ]` — заплановано, `[~]` — у роботі,
> `[x]` — готово.

## Context

OLX Dashboard — single-user React + Chakra UI v3 застосунок, який зараз верстається лише
для desktop (фіксована ширина бічної панелі 320px, таблиця оголошень на 13 колонок
~2200px, діалоги фіксованого розміру). Користувач хоче відкривати застосунок з телефону.
Потрібна базова мобільна адаптація **всього проєкту** (layout-каркас, таблиця оголошень,
усі діалоги/Drawer'и, майстер AI-аналізу).

**Узгоджені рішення з користувачем:**
- **Таблиця оголошень** — лише горизонтальний скрол (без card-view і без авто-приховування
  колонок); мінімальні зміни — виправити елементи toolbar/tooltip, які реально ламають
  layout на 375px (не залежать від підходу до таблиці).
- **Майстер AI-аналізу (`AnalysisWizardDialog`)** — на мобільному діалог стає
  `size="full"`; крок 3 (таблиця "фото+назва | опис | теги критеріїв") на мобільному
  рендериться як стек карток замість `Table.Root` (контент рядка спільний для
  desktop/mobile через єдині JSX-фрагменти — без дублювання логіки toggle/evidence).

**Breakpoint:** Chakra default `md` (768px) — усе, що `< md` (`base`/`sm`), вважається
"мобільним". Для умовного рендеру (JS-розгалуження, не CSS) — спільний хук `useIsMobile()`.

## Критичні файли та поточний стан

- `web/src/App.tsx` — `<Flex direction="column" h="100vh">` → `Header` + `<Flex flex="1"
  overflow="hidden"><Searches/><ListingsTable/></Flex>`. `Searches` керується пропом
  `visible` (стейт `searchesVisible`, persisted), `display: visible ? 'flex' : 'none'`.
- `web/src/components/Searches.tsx` — `<Flex as="aside" w="80" ... display={visible ?
  'flex' : 'none'}>` — фіксована ширина 320px, завжди в DOM-дереві поряд з таблицею.
  `Accordion.Root` з двома секціями («Пошуки» зі списком `SearchRow`, «Новий пошук»).
- `web/src/components/Header.tsx` — `<HStack justify="space-between">` без `wrap`; хардкод
  `ml={"80px"}` на бейджі вибраного пошуку; ліворуч toggle-кнопка сайдбару + іконка +
  заголовок «OLX Dashboard»; праворуч — бейдж автооновлення + `SearchActionPanel` +
  `AnalysisWizardDialog` (кнопка «AI») + `SettingsDrawer`.
- `web/src/components/table/topbar/BulkActionBar.tsx` — `ml={10}` у `HStack gap={5}`
  всередині `HStack gap={3} wrap="wrap"` (`ListingsFilterBar`) — на вузькому екрані при
  перенесенні на новий рядок лишає зайвий лівий відступ 40px.
- `web/src/components/table/DescriptionTooltip.tsx` — `contentProps={{ maxW: '380px' }}` —
  на 375px екрані тултіп шириться за межі viewport.
- `web/src/components/table/topbar/ListingsFilterBar.tsx` — `SegmentGroup.Root` (6 items:
  «Всі» + 5 статусів) у `HStack gap={4} wrap="wrap"` — перевірити, чи переноситься коректно
  на 375px, чи потрібен `overflowX="auto"`.
- `web/src/components/SearchFiltersDrawer.tsx` — `DrawerRoot size="sm"`; рядок-діапазон —
  `HStack gap={2}` з `NativeSelect.Root flex="1"` + два `Input w="90px"` + кнопка видалення —
  на ~280px контенту (drawer `size="sm"` мінус padding) затісно.
- `web/src/components/SearchActionPanel.tsx` — `DialogRoot size="md"`; `SimpleGrid
  columns={3} gap={3}` — статистичні картки, перевірити на 375px.
- `web/src/components/analysis/AnalysisWizardDialog.tsx` — `DialogRoot size="xl"
  placement="center" scrollBehavior="inside"`; степер `HStack gap={2}` (без `wrap`) на
  4 кроки — переповнюється на 327px; крок 3 — `Table.Root css={{ tableLayout: 'fixed' }}` з
  `width="220px"`/`width="50%"` колонками у `Box maxH="50vh" overflowY="auto"` (без
  horizontal scroll) — ламається на мобільному.
- `web/src/components/ui/dialog.tsx` / `drawer.tsx` — без власних max-width/padding
  override; Chakra-дефолти зазвичай дають `width: 100%` з `max-width` по `size`, тож
  більшість діалогів (`DescriptionDialog size="lg"`, `ConfirmActionDialog size="sm"`) уже
  стискаються до viewport — окремих змін не плановано.

## Група 1 — Спільний хук + план-документ

- [x] Створити `docs/plans/mobile-responsive-layout.md` (цей файл).
- [x] Створити `web/src/hooks/useIsMobile.ts`:
  ```ts
  export function useIsMobile(): boolean {
    return useBreakpointValue({ base: true, md: false }) ?? false;
  }
  ```
  (`useBreakpointValue` з `@chakra-ui/react`) — єдине джерело "мобільний/desktop" для
  умовного рендеру (size/layout branching) у `AnalysisWizardDialog` та `Searches`.

## Група 2 — Layout shell: сайдбар → Drawer на мобільному, responsive Header

- [x] `web/src/components/Searches.tsx`:
  - Додано опціональний проп `onVisibleChange?: (visible: boolean) => void`.
  - На мобільному (`useIsMobile()`) вміст рендериться усередині `DrawerRoot
    placement="start" size="xs"` (`open={visible}`, `onOpenChange={(d) =>
    onVisibleChange?.(d.open)}`) — overlay-сайдбар замість постійного `Flex w="80"`; на
    desktop — поточна поведінка без змін (`display: visible ? 'flex' : 'none'`, `w="80"`).
  - При виборі пошуку (`handleSelect`) на мобільному — автоматично закриває drawer
    (`onVisibleChange?.(false)`), щоб не перекривати таблицю.
- [x] `web/src/App.tsx`: передано `onVisibleChange={setSearchesVisible}` у `<Searches/>`.
- [x] `web/src/components/Header.tsx`:
  - `ml={"80px"}` (бейдж вибраного пошуку) → `{ base: 0, md: '80px' }`; додано
    `maxW={{ base: '40vw', md: 'none' }}` + `lineClamp={1}` для назви пошуку.
  - Заголовок «OLX Dashboard» (текст) — приховано на `base`
    (`display={{ base: 'none', md: 'block' }}`), іконка `TbHeartRateMonitor` лишилась завжди.
  - Зовнішній `<HStack justify="space-between">` → додано `wrap="wrap"` + `rowGap={2}`, щоб
    права група кнопок переносилась на новий рядок без горизонтального скролу хедера.

## Група 3 — Таблиця оголошень: toolbar/tooltip фікси (підхід — горизонтальний скрол)

- [x] `web/src/components/table/topbar/BulkActionBar.tsx`: `ml={10}` →
  `ml={{ base: 0, sm: 10 }}`.
- [x] `web/src/components/table/DescriptionTooltip.tsx`: `contentProps={{ maxW: '380px' }}`
  → `contentProps={{ maxW: { base: '85vw', md: '380px' } }}`.
- [x] `web/src/components/table/topbar/ListingsFilterBar.tsx`: `SegmentGroup.Root`
  (6 items) обгорнуто в `Box overflowX="auto" maxW="100%"` — горизонтальний скрол замість
  ламання layout на 375px, без зміни функціоналу.
- [x] `web/src/pages/ListingsTable.tsx`: без структурних змін — `Box flex="1" overflow="auto"`
  вже дає horizontal+vertical scroll для `Table.Root` (13 колонок, ~2200px); touch-скрол
  перевіряється у фінальній верифікації.

## Група 4 — Drawer фільтрів пошуку та панель статистики

- [ ] `web/src/components/SearchFiltersDrawer.tsx`: рядок-діапазон — `<HStack gap={2}>` →
  `<Flex direction={{ base: 'column', sm: 'row' }} gap={2} align={{ sm: 'center' }}>`;
  `NativeSelect.Root` — `flex="1"` → `w={{ base: 'full', sm: '1' }}` (full-width на
  мобільному, коли стек вертикальний); два `Input w="90px"` лишити `w="90px"`.
- [ ] `web/src/components/SearchActionPanel.tsx`: `SimpleGrid columns={3} gap={3}` →
  `columns={{ base: 2, md: 3 }}` якщо при верифікації на 375px картки виявляться затісними.

## Група 5 — Майстер AI-аналізу: full-screen + картки на кроці 3

- [ ] `AnalysisWizardDialog.tsx`: `const isMobile = useIsMobile();` — `DialogRoot
  size={isMobile ? 'full' : 'xl'}`, решта пропів (`placement`, `scrollBehavior`) без змін.
- [ ] Степер: `<HStack gap={2}>` → `<HStack gap={2} wrap="wrap" rowGap={2}>`, щоб 4 кроки
  переносились на 327px без горизонтального скролу.
- [ ] Крок 3: винести спільні JSX-фрагменти для рядка (без дублювання логіки
  `isIncluded`/`toggleIncluded`/evidence-highlight):
  - `photoTitle` — фото (boxSize 12) + назва (`lineClamp={2}`), як зараз у кл.1.
  - `descriptionBlock` — `DescriptionTooltip` + `HighlightText`, як зараз у кл.2; на
    мобільному `lineClamp={4}` замість `3` (більше вертикального простору в картці).
  - `criteriaTags` — `Wrap` бейджів з toggle/tooltip, як зараз у кл.3 (без змін логіки).
  - Розгалуження рендеру за `isMobile`:
    - **desktop** (як зараз) — `Table.Root size="sm" css={{ tableLayout: 'fixed' }}` з
      3 колонками (`width="220px"`, `width="50%"`, авто), кожен фрагмент — у своєму
      `Table.Cell`.
    - **mobile** — `Stack gap={3} maxH="60vh" overflowY="auto"` зі списком `Box p={3}
      borderWidth="1px" rounded="md"` на `visibleRows`, всередині кожної картки —
      `Stack gap={2}>{photoTitle}{descriptionBlock}{criteriaTags}</Stack>` (вертикальний
      порядок: фото+назва → опис → теги).
  - Заголовок-підсумок над таблицею/картками («Показано N із M…») та кнопки Excel/JSON —
    без змін (`HStack justify="space-between" wrap="wrap" gap={2}` вже адаптивний).

## Документація

- [ ] `docs/architecture.md`: коротка примітка про мобільну адаптацію (хук `useIsMobile`,
  Drawer-сайдбар, full-screen wizard на мобільному) у відповідних секціях (фронтенд-структура
  / wizard).
- [ ] `docs/structure.md`: додати рядок для нового файлу `web/src/hooks/useIsMobile.ts`.

## Верифікація / test-cases

- [ ] 375px (мобільний): сайдбар «Пошуки» відкривається як overlay Drawer (placement
  start), не зсуває таблицю; вибір пошуку в drawer закриває його.
- [ ] 375px: хедер — кнопки (AI/Settings/SearchActionPanel) не переповнюють рядок, бейдж
  вибраного пошуку не розпирає layout, заголовок «OLX Dashboard» прихований (іконка
  лишається).
- [ ] 375px: `BulkActionBar` (після вибору рядків таблиці) не створює зайвий відступ при
  перенесенні на новий рядок.
- [ ] 375px: hover/tap на описі в основній таблиці — tooltip не виходить за межі екрана.
- [ ] 375px: `SegmentGroup` фільтра статусів — або переноситься коректно, або має
  горизонтальний скрол без ламання сторінки.
- [ ] 375px: `SearchFiltersDrawer` — рядок діапазону (select + 2 інпути + видалення) не
  обрізається і не переповнює drawer.
- [ ] 375px: `SearchActionPanel` — статистичні картки читабельні, без горизонтального
  переповнення діалогу.
- [ ] 375px: `AnalysisWizardDialog` відкривається `size="full"`, степер (4 кроки) не
  переповнює рядок.
- [ ] 375px: крок 3 wizard — рядки рендеряться як картки (фото+назва → опис → теги), toggle
  критеріїв і evidence-highlighting працюють так само, як у desktop-таблиці.
- [ ] ≥768px (desktop, `md`): усі зміни — без регресій, попередній вигляд (постійний
  сайдбар 320px, `Table.Root` на кроці 3, `size="xl"` wizard) зберігається.
- [ ] `npm run build` (web) проходить TS strict + vite build.

## Інваріанти (без змін)
- Аналіз лишається ручним (ніколи авто).
- `evidence` НЕ зберігається в БД.
- Єдине джерело промптів — `prompts.ts`.

## Коміти
1. `feat: add useIsMobile hook and convert sidebar to mobile drawer with responsive header`
   — Група 1 + 2.
2. `fix: mobile-friendly listings toolbar, description tooltip width`
   — Група 3.
3. `fix: responsive layout for search filters drawer and action panel`
   — Група 4.
4. `feat: full-screen AI wizard on mobile with card layout for review step`
   — Група 5.
5. `docs: document mobile-responsive-layout plan and update architecture/structure`
   — Документація.
