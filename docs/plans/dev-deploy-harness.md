# План: мінімальний харнес для розробки й деплою

> **Статус:** 🟢 активний (з 2026-09-29) · H1 CI і H2 Node 22 (репо + Render, 2026-09-30) зроблено; прод на `main` (`render-to-main.md`); далі H3–H6 — після S6, S4, S14, S10 зі `stability-baseline.md` (порядок людини, 2026-10-03).

## Контекст

Локальний харнес уже є: `npm run check` (typecheck + Vitest + docs + skills), `docs/development.md`,
автоміграція схеми. Чого немає:
- **CI** — перевірки запускаються лише вручну (GitHub «Checks: 0»).
- **Деплой** налаштований руками в Render dashboard з feature-гілки (гайд
  `deploy-render-turso.md`), конфіг ніде не зафіксований; фронт зараз недоступний (S1 у
  `stability-baseline.md`).
- **Node** не зафіксований (`engines`/`.nvmrc`), на проді — EOL Node 20.
- **Реліз/відкат/бекап Turso** — не описані; smoke після деплою — вручну.

Мета — мінімум, що дає «зелений `main` = робочий прод»: кожен PR перевіряється автоматично,
прод деплоїться лише з `main` після зеленого CI, є швидка перевірка й відкат.

## Рішення (мінімум)

| # | Що | Навіщо |
|---|---|---|
| H1 | **GitHub Actions CI**: на PR і push у `main` — `npm ci` → `npm run check` → `npm run build` (Node 22) | Зламаний код не потрапляє в `main` |
| H2 | **Node 22 LTS**: `engines` у `package.json`, `.nvmrc`, `NODE_VERSION=22` на Render | Однакова версія скрізь, не EOL |
| H3 | **`render.yaml` (Blueprint)**: обидва сервіси (API + Static Site), build/start, `healthCheckPath: /health`, rewrite `/api/*`, env-ключі (значення — у dashboard), гілка `main`, auto-deploy **після зеленого CI** | Конфіг деплою в git, відтворюваний; відновлення S1 одним кліком |
| H4 | **`npm run smoke -- <api-url> [web-url]`**: `/health` 200, `/api/*` без сесії → 401, фронт `index.html` 200 | Перевірка деплою за хвилину, з будь-якого ПК |
| H5 | **Runbook** у `docs/deploy-render-turso.md` → розділ «Реліз»: чекліст (CI зелений → merge → деплой → smoke → лог «Міграція схеми»), відкат (Render «Rollback» + обмеження: міграції схеми лише додають колонки — відкат коду безпечний), бекап Turso перед ризиковими змінами | Передбачуваний реліз і відкат |
| H6 | **Dependabot** (npm, щотижня, групування minor/patch) | Вразливості не накопичуються місяцями (S6) |

Поза мінімумом (пізніше): pre-commit hook, staging-середовище, e2e у CI (Playwright),
моніторинг/алерти, пінг проти засинання free-тарифу.

## Файли

- `.github/workflows/ci.yml`, `.github/dependabot.yml` (нові)
- `render.yaml` (новий), `.nvmrc` (новий), `package.json` (`engines`, `smoke`)
- scripts/smoke.mjs (новий)
- `docs/deploy-render-turso.md`, `docs/development.md`, `AGENTS.md` (команди, CI), `docs/structure.md`

## Кроки

- [x] Людина: стан сервісів у Render (S1/S2 `stability-baseline.md`), доступ агента до Render і Turso (MCP) — 2026-09-30.
- [x] H2 Node 22 у репо: `.nvmrc`, `engines`, документація. ✅ `NODE_VERSION=22` на Render (2026-09-30,
      разом із переведенням обох сервісів на `main` — `render-to-main.md`; прод на Node 22.23.3).
- [x] H1 CI: `.github/workflows/ci.yml` (push у будь-яку гілку + ручний запуск).
- [ ] H4 smoke-скрипт.
- [ ] H3 `render.yaml` → людина підключає Blueprint у Render (або звіряє з наявними сервісами) →
      деплой з `main` → smoke.
- [ ] H5 runbook.
- [ ] H6 Dependabot.
- [ ] Документація.

## Оцінка

| Крок | Оцінка | Хто |
|---|---|---|
| H1 CI | 1–1,5 год | агент |
| H2 Node 22 | 0,5 год | агент + людина (env у Render) |
| H3 render.yaml + перенесення деплою на `main` | 2–3 год | агент пише, людина застосовує в Render |
| H4 smoke | 0,5–1 год | агент |
| H5 runbook | 1 год | агент |
| H6 Dependabot | 0,25 год | агент |
| **Разом** | **~5,5–7 год** | з них ~1 год дій людини в Render/Turso |

## Ризики

- Blueprint поверх наявних сервісів, створених вручну, може створити дублікати — спершу звірити
  назви або підключати Blueprint до нових сервісів і перенести домени/env.
- Секрети — лише в Render dashboard (`sync: false` у `render.yaml`), не в git.
- CI без доступу до OLX: тести й так не ходять у мережу; живу пробу OLX у CI не додаємо (ввічливість).

## Test-cases

- PR з навмисною помилкою типів → CI червоний; виправлення → зелений.
- Merge у `main` → Render деплоїть лише після зеленого CI; `npm run smoke` проти проду — усе ✅.
- Render «Rollback» на попередній деплой → smoke ✅.
- Нова колонка в `schema.sql` → у лозі деплою `Міграція схеми: ALTER TABLE …`.
