# План: Тема стилів + винесення констант (рефакторинг фронтенду)

## Контекст / мотивація

Запит: пройтися по проєкту й винести «magic»-значення в окремі файли (константи,
хелпери, хуки), а **стильові константи — в окрему систему теми**, щоб керувати
кольорами та розмірами з кількох центральних констант («щось типу теми»).

Стан на момент старту (аудит):
- **Сервер уже добре структурований**: `server/src/scraper/constants.ts`,
  `server/src/scraper/graphql/constants.ts`, `server/src/analysis/constants.ts`.
  Виносити майже нічого — у скоуп цього плану сервер НЕ входить.
- **Фронтенд** уже має `web/src/constants.ts`, розгалужені `web/src/utils/*`,
  `web/src/hooks/*`, `web/src/stores/*` — хелпери/хуки вже добре винесені.
- **Головна прогалина — стилі**: Chakra працює на `defaultSystem` (кастомної теми
  немає). Акцентний колір `colorPalette="blue"` зашитий буквально у **35 місцях**;
  немає єдиної точки керування акцентом/розмірами. Статусні кольори централізовано
  (`utils/status.ts`) — взяти як зразок.
- Hex-кольорів у коді немає (0) — усе на Chakra-токенах.

## Принцип

Один центральний модуль `web/src/theme/` стає **єдиним джерелом стильових рішень**:
змінив акцент/розмір в одному файлі → змінилось скрізь. Семантика замість буквальних
назв кольорів (`accent` замість `blue`).

## Файли

- `web/src/theme/palette.ts` — НОВИЙ. Вибір кольорів: `ACCENT_BASE` (базова палітра
  акценту), мапи статусних/семантичних палітр (джерело істини).
- `web/src/theme/tokens.ts` — НОВИЙ. `defineConfig` з семантичним токеном `accent`
  (аліас на `ACCENT_BASE`) + кастомні радіуси/розміри за потреби.
- `web/src/theme/system.ts` — НОВИЙ. `createSystem(defaultConfig, customConfig)`.
- `web/src/theme/layout.ts` — НОВИЙ. JS-константи розмірів/відступів для Chakra-пропсів
  (ширина панелей, відступи порожніх станів, розміри діалогів, щільність таблиці).
- `web/src/theme/index.ts` — НОВИЙ. Barrel.
- `web/src/components/ui/provider.tsx` — використати кастомний `system` замість `defaultSystem`.
- `web/src/utils/status.ts` — `STATUS_COLORS` тепер бере значення з `theme/palette`
  (re-export для стабільності імпортів).
- ~35 компонентів — sweep `colorPalette="blue"` → `colorPalette="accent"`
  (+ поодинокі `blue.subtle`/`blue.500` → `accent.subtle`/`accent.solid`). Нульова
  візуальна зміна (accent === blue за замовчуванням).
- `web/src/pages/ListingsTable.tsx` та центральні діалоги/панелі — застосувати
  `LAYOUT`-константи у найтрафіковіших місцях (демонстрація патерну).
- `docs/structure.md`, `docs/architecture.md` — додати `web/src/theme/`.

## Кроки

- [x] 1. Створити `web/src/theme/palette.ts` (ACCENT_BASE + STATUS_PALETTE + ключі/кроки палітри).
- [x] 2. Створити `web/src/theme/tokens.ts` (токен `accent`: числова шкала + семантичні аліаси на ACCENT_BASE).
- [x] 3. Створити `web/src/theme/system.ts` (`createSystem`) + `index.ts` (barrel).
- [x] 4. Створити `web/src/theme/layout.ts` (LAYOUT-константи розмірів/відступів).
- [x] 5. Підключити `system` у `provider.tsx`.
- [x] 6. `utils/status.ts` → брати `STATUS_COLORS` з `theme/palette`.
- [x] 7. Sweep ВСІХ `blue` (colorPalette/badgeColorPalette, семантичні `blue.solid…`, числова
  шкала `blue.500…blue.50`, опейсіті `blue.50/60`) → `accent`. Єдиний `blue`, що лишився —
  `ACCENT_BASE` у `palette.ts`.
- [x] 8. Застосувати `LAYOUT` у `ListingsTable.tsx`, `Searches.tsx`, дроверах і діалогах.
- [x] 9. `npm run build` зелений; візуальних змін немає (accent === blue).
- [x] 10. Оновити `docs/structure.md` + `docs/architecture.md`.

## Прохід 2: семантичні feedback-палітри

Розширення теми на сигнальні кольори (раніше зашиті `orange`/`red`/`green`):
- [x] `palette.ts` — `FEEDBACK_BASE` (`success`→green, `warning`→orange, `danger`→red,
  `info`→ACCENT_BASE) + `THEME_PALETTES` (ім'я→база для генерації токенів).
- [x] `tokens.ts` — узагальнено генерацію: числова шкала + семантичні аліаси для кожної
  палітри з `THEME_PALETTES` (accent/success/warning/danger/info).
- [x] Sweep у `.tsx`: `orange`→`warning`, `red`→`danger`, `green`→`success` (colorPalette,
  raw-токени `*.fg/.subtle/.500/…`, опейсіті, CSS-var `--chakra-colors-*`). `yellow`
  (highlight, mid-tier rank) і доменні `purple`/`cyan`/`teal`/`gray` лишено.
- [x] `STATUS_PALETTE`: `interested`→`success`, `disabled`→`danger` (наслідують feedback).
- [x] `npm run build` зелений; behavior-neutral (success/warning/danger === green/orange/red).

## Висновок аудиту: хелпери/хуки

Хелпери (`web/src/utils/*`), хуки (`web/src/hooks/*`), стори (`web/src/stores/*`) і
доменні константи (`web/src/constants.ts`) уже добре винесені — окремого великого
рефакторингу не потребують. Сервер так само має структуровані `constants.ts`
(`scraper/`, `scraper/graphql/`, `analysis/`). Тому фокус цього проходу — стильова тема
(головна прогалина: відсутність кастомної системи + зашитий акцент `blue`).

## Test-cases

- TC1. `npm run build` (root) — обидва воркспейси білдяться без помилок.
- TC2. Grep: `colorPalette="blue"` більше не зустрічається у `web/src` (усе → `accent`).
- TC3. Зміна `ACCENT_BASE` (напр. blue→teal) у `palette.ts` змінює акцент усюди
  (перевірка вручну/візуально), без правок в інших файлах.
- TC4. Темна/світла тема працює як раніше (accent успадковує dark-варіанти blue).
- TC5. Статусні бейджі/селекти зберігають кольори (STATUS_COLORS незмінні за значенням).
