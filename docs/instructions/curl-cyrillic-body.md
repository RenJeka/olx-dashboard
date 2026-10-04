---
name: curl-cyrillic-body
created: 2026-10-04
source: сесія 2026-10-03 (smoke Excel-експорту)
---
# Кирилиця в `curl -d` у Git Bash — `Content-Length` не збігається з тілом

## Коли застосовувати
Smoke API локально через `curl` у Git Bash на Windows, і в JSON-тілі є кирилиця; сервер (Fastify)
відповідає `400 Request body size did not match Content-Length`.

## Що робити
- Тіло записати у файл UTF-8 (напр. `node -e` з `JSON.stringify` або редактором) і передати
  `curl --data-binary @<файл>` з `-H 'content-type: application/json'`.

## Чого не робити
- Не шукати помилку на сервері: це артефакт кодування аргументу командного рядка, не баг API.

## Як перевірити
Той самий запит із тілом із файлу повертає очікуваний код (напр. `200`).

## Пов'язане
[docs/development.md](../development.md) → «Smoke API».
