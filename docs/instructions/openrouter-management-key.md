---
name: openrouter-management-key
created: 2026-10-17
source: сесія 2026-10-17 (ключ OpenRouter на проді)
---
# OpenRouter: Management key замість API key → `401 User not found`

## Коли застосовувати
Кнопка «Згенерувати» (чи інша AI-дія) є, але запит падає з `502` і
`OpenRouter HTTP 401: {"error":{"message":"User not found.","code":401}}`. Або людина створює новий ключ OpenRouter
для застосунку.

## Що робити
- Кнопки авто-режиму з'являються лише за наявності `OPENROUTER_API_KEY` у сервера (`GET /api/analysis/status` →
  `apiAvailable`), тож видима кнопка ≠ робочий ключ.
- Ключ для застосунку — звичайний **API key**: https://openrouter.ai/settings/keys → **Create Key**, з лімітом витрат
  (Credit limit). **Management key** (окрема сторінка) моделі викликати не може — у вікні створення червоний текст
  «cannot make model requests».
- Перевірити ключ без витрат: `GET https://openrouter.ai/api/v1/key` із `Authorization: Bearer <ключ>` → `200` і
  `label`/`limit`/`usage`; ключ у вивід не друкувати ([secrets-in-sources](secrets-in-sources.md)).
- Ключ на Render вставляє людина (Environment → **Save and deploy**, [render-env-change-redeploys](render-env-change-redeploys.md)).

## Чого не робити
- Не лишати Management key у змінних Render чи `.env`: він керує всіма ключами акаунта — після заміни видалити.
- Не шукати причину в гілці чи деплої, поки не перевірено тип ключа.

## Як перевірити
«Налаштування» → «AI-аналіз» — «ключ є (авто)»; «Згенерувати» повертає список без помилки.

## Пов'язане
- [ai-flow](../ai-flow.md) — авто- і ручний режими AI.
- [deploy-render-turso](../deploy-render-turso.md) → «Фактичний прод».
