# OLX Dashboard

Персональна single-user система моніторингу оголошень **OLX.ua**: збір через GraphQL API OLX
→ SQLite → React-таблиця зі статусами/нотатками/історією цін (за етапами)
та експортом у Notion. Локальний запуск або деплой Render + Turso (див. нижче).

## Стек

npm workspaces (`server/` — Fastify + libSQL/Turso, `web/` — React + Vite + Chakra UI); збір — GraphQL OLX без
браузера. Повний стек і версії-обмеження — [`AGENTS.md`](AGENTS.md) → «Стек», точні версії — `package.json`.

## Швидкий старт

```bash
npm install          # залежності обох воркспейсів
npm run dev          # server :3001 + web :5173 паралельно
```

> **Авторизація (Google OAuth):** дашборд захищений логіном — пускає лише тебе. Перед першим
> запуском налаштуй Client ID та `.env` файли. Детальна покрокова інструкція →
> **[`docs/google-oauth-setup.md`](docs/google-oauth-setup.md)**.
>
> Якщо хочеш запускати локально без логіну (для розробки): `AUTH_DISABLED=true` у `server/.env`.

Відкрий http://localhost:5173 → увійди через Google → створи пошук (напр. query `iphone 13`,
ціна 8000–15000) → натисни **Сканувати** → оголошення зʼявляться в таблиці. Повторний Scan не
дублює рядки (дедуплікація по `olx_id`).

CLI-скан без UI:

```bash
npm run scan -- --search <id>
```

БД зберігається у `server/data/olx.db` (gitignored, створюється автоматично).

## LLM-аналіз мінусів/плюсів (кнопка «AI»)

Кнопка «AI» у шапці: фільтр релевантності, мінуси/плюси за критеріями, AI Вибір — лише вручну. Без ключа —
ручний режим (промпт у будь-який чат); з ключем OpenRouter (`OPENROUTER_API_KEY` у `server/.env`, ключ —
https://openrouter.ai/keys) — авто. Рушії, модель і налаштування — [`docs/ai-flow.md`](docs/ai-flow.md).

## Стан і документація

Етапи, інваріанти й карта документації — [`AGENTS.md`](AGENTS.md); поточний стан — [`docs/current.md`](docs/current.md).
