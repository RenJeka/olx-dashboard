# OLX Dashboard

Персональна single-user система моніторингу оголошень **OLX.ua**: збір через GraphQL API OLX
(fallback — HTML) → SQLite → React-таблиця зі статусами/нотатками/історією цін (за етапами)
та експортом у Notion. Локальний запуск, без зовнішніх сервісів.

## Стек

- **Monorepo:** npm workspaces — `server/` + `web/`
- **Backend:** Node.js 20+, TypeScript, Fastify 5, @libsql/client (Turso/SQLite), cheerio
- **Frontend:** React 18, Vite 6, TanStack Query/Table, Chakra UI v3 (+ next-themes, react-icons/lu)
- **Збір даних:** GraphQL `POST /apigateway/graphql` (основний) + `fetch`/cheerio HTML-fallback (без браузера/Playwright)

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
ціна 8000–15000) → натисни **Scan** → оголошення зʼявляться в таблиці. Повторний Scan не
дублює рядки (дедуплікація по `olx_id`).

CLI-скан без UI:

```bash
npm run scan -- --search <id>
```

БД зберігається у `server/data/olx.db` (gitignored, створюється автоматично).

## LLM-аналіз мінусів/плюсів (кнопка «AI»)

Майстер «AI» (хедер) аналізує описи оголошень і знаходить **мінуси/плюси** за критеріями.
Працює у двох рівноправних режимах:

- **Безкоштовний (ручний, без ключа):** на кожному кроці — «Скопіювати промпт»/«Завантажити
  пакет», прогін у будь-якому безкоштовному чаті (ChatGPT/Gemini/тощо) → «Вставити
  відповідь». Ключ не потрібен.
- **Авто (OpenRouter):** сервер сам шле запити. Потрібен ключ:
  1. Отримай ключ на https://openrouter.ai/keys
  2. `cp server/.env.example server/.env` і впиши `OPENROUTER_API_KEY=...`
  3. Перезапусти `npm run dev`. Модель/`reasoning`/додаткові критерії — у «Налаштування →
     AI-аналіз» (дефолт `google/gemini-2.5-flash-lite`).

`server/.env` ігнорується git (закомічено лише `.env.example`). Аналіз запускається **тільки
вручну** (ніколи зі сканів/автооновлення). Деталі — `docs/plans/llm-analysis.md`.

## Стан

Реалізовано **Етап 1 (MVP)**: scraper (GraphQL — основний, HTML — fallback) + SQLite + REST
(CRUD пошуків, scan, listings) + React-таблиця на Chakra UI v3 (сортування, видимість колонок,
темна/світла тема через Drawer налаштувань; колонки «Опис»/«Продавець»/«Активність», лічильник
«Результатів: N»). Наступні етапи (статуси, нотатки, історія цін, Notion, cron) — у документації нижче.

## Документація

- [`docs/olx-monitor-spec.md`](docs/olx-monitor-spec.md) — канонічна специфікація (вимоги, схема БД, етапи, ризики)
- [`docs/architecture.md`](docs/architecture.md) — технічна архітектура та потік даних
- [`docs/olx-api.md`](docs/olx-api.md) — API OLX: GraphQL (основний метод) + HTML fallback (параметри, заголовки, приклади, dataflow фронтенду OLX)
- [`docs/olx-graphql-fields-reference.md`](docs/olx-graphql-fields-reference.md) — довідник усіх полів GraphQL-відповіді OLX
- [`docs/structure.md`](docs/structure.md) — структура файлів і папок
- [`docs/plans/initial-mvp.md`](docs/plans/initial-mvp.md) — план Етапу 1 із прогресом
- [`docs/plans/graphql-migration.md`](docs/plans/graphql-migration.md) — план міграції збору на GraphQL
- [`docs/google-oauth-setup.md`](docs/google-oauth-setup.md) — покрокове налаштування Google OAuth (Google Console, env-змінні, локал, Render)
- [`CLAUDE.md`](CLAUDE.md) — інваріанти й конвенції (обовʼязкові при змінах)
