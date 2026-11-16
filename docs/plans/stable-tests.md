# План: стабільний підхід до тестів

> **Статус:** 🟢 активний · [P-006](../parking.md) (частина «фронтенд»)

## Контекст

Тести є лише на сервері; фронтенд не покрито зовсім. Частина серверних тестів крихка: порівнює цілий об'єкт заради
одного поля, копіює тексти помилок рядком, підміняє внутрішні модулі. Такі тести падають від правок, які поведінку
не міняють, і привчають «підганяти тест під код».

Задача людини (2026-11-16): закласти правила, покрити фронтенд базовими тестами чистих функцій, прибрати явну
крихкість на сервері. Поведінку коду не міняти.

Точка відліку: тестів сервера — 34 файли, 322 тести, усі зелені (`main` на `4e2aefb`).

## Правила (єдине джерело — `docs/development.md` §7 «Підхід до тестів»)

Текст правил — від людини; у плані не дублюється.

## Файли

Нові:
- `web/vitest.config.ts` — Vitest у workspace `web`, середовище `node`, без jsdom.
- `web/src/test/factories.ts` — фабрики: оголошення, пошук, результати AI, категорії, стан форми фільтрів.
- `web/src/utils/*.test.ts` — по файлу на модуль: `aiScope`, `listingVisibility`, `localFilters`, `search`,
  `categoryCounts`, `olxCategoryTree`, `format`, `scanWarning`.
- `web/src/test/table.ts` — `runCases`: таблиця випадків модуля через `it.each`.
- `server/src/services/constants.ts` — `SERVICE_ERRORS`: тексти помилок сервісів.
- `scripts/test-changed.mjs` — прогін тестів лише змінених файлів (`npm run test:changed`).

Змінені:
- `web/package.json`, `web/tsconfig.json`, кореневий `package.json`, `package-lock.json` — Vitest у `web`, скрипти.
- `server/src/test/db.ts` — `insertListing` приймає свій `title`; `createSearch` — свої поля пошуку.
- Тести сервера з кроку 6 і константи текстів помилок у коді, на які вони посилаються.
- Доки: `docs/development.md` §7, `AGENTS.md`, `docs/structure.md`, `docs/architecture.md`, `docs/parking.md`,
  `docs/instructions/test-insert-listing-title.md` (пастку закрито — тепер це патерн).

## Кроки

- [x] 1. План.
- [x] 2. Правила — у `docs/development.md` §7; рядок із посиланням — в `AGENTS.md` → «Перевірка».
- [x] 3. Фабрики: `web/src/test/factories.ts`; на сервері — `insertListing` зі своїм `title`, `createSearch` зі
      своїми полями.
- [x] 4. Vitest у `web` (без браузера й jsdom); тести восьми модулів — на модуль одна таблиця випадків.
- [x] 5. Тести `web` — у `npm test` і `npm run check` (отже, і в CI); `npm run test:changed`.
- [x] 6. Разовий прохід по тестах сервера — лише явна крихкість (перелік нижче).
- [x] 7. Доки: `structure.md`, `architecture.md`, `AGENTS.md`, P-006.

### Крок 6 — що саме міняється

Кількість тестів не міняється; жодна перевірка не зникає без заміни.

1. **Тексти помилок рядком → константа з коду.** Тести маршрутів `searches`, `projects`, `listings`, `categories`,
   `aiCommit` порівнюють відповідь із константою. Де тексту в коді константою не було — винесено в експортовану
   константу: сервіси `searches`, `projects`, `listings` — `SERVICE_ERRORS`; маршрути `searches`, `categories` —
   поруч із кодом. Текст той самий. `aiRoutes.test.ts` — на `ANALYSIS_ERRORS`.
   Помилки з підставленим значенням («Невідомий статус: sold») — перевірка коду відповіді й того, що значення є в
   тексті.
2. **Підміна внутрішнього модуля `categories/tree` → реальний модуль.** `scanFinalize.test.ts`: замість «функцію
   викликано / не викликано» — результат у БД (`searches.base_category_id`). `variantLoop.test.ts`: підміну знято,
   автокатегорія рахується на тимчасовій БД. Мережі немає: facet OLX лишається підміненим.
3. **Повне порівняння великого об'єкта → часткове** — три місця, де тест про одне-два поля порівнював цілу
   відповідь: `last-analysis` (`searches.test.ts`), вузол дерева (`categories.test.ts`), відповідь `PUT criteria`
   (`analysis/criteria.test.ts`). Решта повних порівнянь — малі контракти відповідей, лишились.
4. `aiRoutes.test.ts`: помічник `addListing` задає заголовок через `insertListing` (раніше — окремим `UPDATE`).

### Свідомо не чіпаємо

- `variantLoop.test.ts` — тексти `scan_runs.warning` і помилки плану рядком: це характеризаційні тести перед фазою 5
  [refactor-clean-architecture](refactor-clean-architecture.md), вони саме фіксують текст; сканер поза обсягом.
  З тієї ж причини текст «План застарів…» у `searches.test.ts` лишився рядком: його кидає сканер.
- Тести промптів (`analysis/criteria.test.ts`, `jev.test.ts`) — рядок промпту там і є результатом.
- Підміна `logger` — тести перевіряють запис у журнал; `collector` у тесті маршруту — реальний ходив би з паузами.
- Підміни зовнішнього: OLX (`fetchCategoryFacet`, `probeListingPage`), OpenRouter (`chat`), Jev (`decide`), паузи.

## Test-cases

Автоматичні:
1. `npm test` — тести сервера: 34 файли, 322 тести, зелені (як до змін); тести `web` — зелені.
2. `npm run check` і `npm run build` — зелені.
3. `npm run test:changed` без змін у робочій теці — нічого не запускає і завершується успішно; після правки
   `web/src/utils/search.ts` — запускає лише `search.test.ts`.
4. `insertListing` зі своїм `title` — перевіряється через `aiRoutes.test.ts`, де заголовок потрібен пре-фільтру
   релевантності й ZIP-пакету.

Ручних test-cases немає: UI і поведінка сервера не змінюються.
