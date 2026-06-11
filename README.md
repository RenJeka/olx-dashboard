# OLX Monitor

Персональна single-user система моніторингу оголошень **OLX.ua**: збір через GraphQL API OLX
(fallback — HTML) → SQLite → React-таблиця зі статусами/нотатками/історією цін (за етапами)
та експортом у Notion. Локальний запуск, без зовнішніх сервісів.

## Стек

- **Monorepo:** npm workspaces — `server/` + `web/`
- **Backend:** Node.js 20+, TypeScript, Fastify 5, better-sqlite3, cheerio
- **Frontend:** React 18, Vite 6, TanStack Query/Table, Chakra UI v3 (+ next-themes, react-icons/lu)
- **Збір даних:** GraphQL `POST /apigateway/graphql` (основний) + `fetch`/cheerio HTML-fallback (без браузера/Playwright)

## Швидкий старт

```bash
npm install          # залежності обох воркспейсів
npm run dev          # server :3001 + web :5173 паралельно
```

Відкрий http://localhost:5173 → створи пошук (напр. query `iphone 13`, ціна 8000–15000) →
натисни **Scan** → оголошення зʼявляться в таблиці. Повторний Scan не дублює рядки
(дедуплікація по `olx_id`).

CLI-скан без UI:

```bash
npm run scan -- --search <id>
```

БД зберігається у `server/data/olx.db` (gitignored, створюється автоматично).

## Стан

Реалізовано **Етап 1 (MVP)**: scraper (GraphQL — основний, HTML — fallback) + SQLite + REST
(CRUD пошуків, scan, listings) + React-таблиця на Chakra UI v3 (сортування, видимість колонок,
темна/світла тема через Drawer налаштувань; колонки «Опис»/«Продавець»/«Статус OLX», лічильник
«Результатів: N»). Наступні етапи (статуси, нотатки, історія цін, Notion, cron) — у документації нижче.

## Документація

- [`docs/olx-monitor-spec.md`](docs/olx-monitor-spec.md) — канонічна специфікація (вимоги, схема БД, етапи, ризики)
- [`docs/architecture.md`](docs/architecture.md) — технічна архітектура та потік даних
- [`docs/olx-api.md`](docs/olx-api.md) — API OLX: GraphQL (основний метод) + HTML fallback (параметри, заголовки, приклади, dataflow фронтенду OLX)
- [`docs/olx-graphql-fields-reference.md`](docs/olx-graphql-fields-reference.md) — довідник усіх полів GraphQL-відповіді OLX
- [`docs/structure.md`](docs/structure.md) — структура файлів і папок
- [`docs/plans/initial-mvp.md`](docs/plans/initial-mvp.md) — план Етапу 1 із прогресом
- [`docs/plans/graphql-migration.md`](docs/plans/graphql-migration.md) — план міграції збору на GraphQL
- [`CLAUDE.md`](CLAUDE.md) — інваріанти й конвенції (обовʼязкові при змінах)
