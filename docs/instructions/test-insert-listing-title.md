---
name: test-insert-listing-title
created: 2026-11-10
source: сесія 2026-11-10 (характеризаційні тести AI-маршрутів, план refactor-general-modules)
---
# `insertListing` у тестах ігнорує переданий заголовок

## Коли застосовувати
Тест на тимчасовій БД потребує оголошення з конкретним заголовком (пре-фільтр релевантності, пошук, промпт), а в
результаті бачиш `item <olx_id>`.

## Що робити
- Хелпер `insertListing` (`server/src/test/db.ts`) сам ставить заголовок `item <olx_id>`; поле `title` у третьому
  аргументі не діє.
- Потрібен свій заголовок — після вставки `UPDATE listings SET title = ? WHERE olx_id = ?` (приклад — `addListing` у
  `server/src/routes/aiRoutes.test.ts`).

## Чого не робити
- Не шукати причину в коді, який тестуєш: спершу перевір рядок у БД.

## Як перевірити
`SELECT title FROM listings WHERE olx_id = ?` повертає заданий заголовок.

## Пов'язане
- [development](../development.md) §7 (автотести)
