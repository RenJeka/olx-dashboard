---
name: npm-lockfile-peer-flags
created: 2026-10-04
source: хендоф 2026-10-04-s17-s10-harness
---
# Локальний `npm install` дописує `"peer": true` у `package-lock.json`

## Коли застосовувати
Після `git pull` з оновленими залежностями (Dependabot-PR) локальний `npm install` змінює
`package-lock.json`, хоча залежності не чіпали.

## Що робити
- Подивитись `git diff package-lock.json`: якщо там лише додані `"peer": true` (службові позначки іншої
  версії npm) — відкотити: `git checkout package-lock.json`.
- Залежності встановлено й так; lock-файл у репо — той, що згенерував Dependabot і перевірив CI (`npm ci`).

## Чого не робити
- Не комітити такий diff окремим PR і не змішувати його з іншими змінами.

## Як перевірити
`git status --short` чистий; `npm run check` зелений.
