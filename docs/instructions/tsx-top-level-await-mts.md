---
name: tsx-top-level-await-mts
created: 2026-10-01
source: хендоф 2026-09-30-stability-harness-access
---
# Одноразовий tsx-скрипт з top-level await — розширення `.mts`

## Коли застосовувати
Пишеш тимчасовий TypeScript-скрипт (діагностика, разовий запит до БД) і запускаєш його `npx tsx`.

## Що робити
- Скрипт поза `server/` (корінь, scratchpad) називати `*.mts`: кореневий `package.json` не має
  `"type": "module"`, тож `.ts` там трактується як CommonJS, і top-level `await` падає.
- Або класти скрипт у `server/` (там `"type": "module"`) — але не комітити разові скрипти.

## Чого не робити
- Не обгортати все в IIFE лише заради `await` — простіше `.mts`.

## Як перевірити
`npx tsx <file>.mts` виконується без помилки про top-level await.
