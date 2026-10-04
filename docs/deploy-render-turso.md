# 🚀 Деплой olx-dashboard вручну: Render + Turso (безкоштовно)

Покрокова інструкція, щоб **самому** розгорнути застосунок у хмарі й зрозуміти, як усе
склеюється. Усе — на безкоштовних тарифах. Орієнтовний час: **20–30 хвилин**.

---

## 🗺️ Що ми будуємо (карта)

Три безкоштовні «цеглинки», які спілкуються між собою:

```
  Браузер
     │  відкриває сайт
     ▼
┌──────────────────────────┐        /api/* (rewrite)        ┌──────────────────────────┐
│  Render Static Site      │ ───────────────────────────►   │  Render Web Service      │
│  (фронтенд: web/dist)    │                                │  (бекенд: Fastify :PORT) │
│  olx-dashboard-web       │ ◄───────────────────────────   │  olx-dashboard-api       │
└──────────────────────────┘         JSON-відповіді          └────────────┬─────────────┘
                                                                          │ libSQL
                                                                          ▼
                                                             ┌──────────────────────────┐
                                                             │  Turso (хмарна БД)       │
                                                             │  libSQL / SQLite-сумісна │
                                                             └──────────────────────────┘
```

- **Turso** — зберігає дані (пошуки, оголошення). Живе окремо, тож перезапуск бекенду нічого не втрачає.
- **Render Web Service** — наш Node/Fastify-бекенд (`server/`). Сканує OLX, пише в Turso.
- **Render Static Site** — зібраний React (`web/dist`). Статичні файли + rewrite-правило, яке
  перенаправляє `/api/*` на бекенд (тому фронт думає, що API «поруч» — жодного CORS).

> 💡 Чому rewrite, а не «фронт стукає на адресу бекенду напряму»? Бо так браузер бачить усі
> запити як **same-origin** (той самий домен) — не треба налаштовувати CORS, а відносні `/api/...`
> у коді працюють без змін.

> ⚠️ **Фактичний прод (з 2026-09-30) відрізняється від цієї схеми:**
> - обидва сервіси деплояться з гілки **`main`** — Auto-Deploy **«After CI Checks Pass»** (лише після зеленого CI),
>   Node 22 (`NODE_VERSION=22`);
> - налаштування обох сервісів зафіксовано в [`render.yaml`](../render.yaml) — еталон, **не** підключений як
>   Blueprint (новий Blueprint створив би дублікати; рішення — `docs/plans/h3-render-yaml.md`);
> - Static Site названо **`olx-dashboard`** → `https://olx-dashboard.onrender.com` (не `…-web`);
> - фронт ходить в API **напряму** через `VITE_API_BASE=https://olx-dashboard-api.onrender.com`
>   (`web/src/api/base.ts`), бекенд дозволяє CORS для `WEB_ORIGIN=https://olx-dashboard.onrender.com`;
> - rewrite `/api/*` **прибрано** (був битий), лишається лише SPA-fallback `/*` → `/index.html`.
> Історія переведення — `docs/plans/old/render-to-main.md`.

---

## ✅ Передумови (5 хв)

1. Код запушено в GitHub, гілка `main` (прод деплоїться лише з неї; CI має бути зеленим).
2. Акаунт **GitHub** (вже є).
3. Зареєструватись (безкоштовно, через GitHub):
   - **Turso** — https://turso.tech
   - **Render** — https://render.com
4. (Опційно) встановити Turso CLI — знадобиться, щоб отримати URL та токен БД:
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   # перезапусти термінал або: source ~/.bashrc
   ```

---

## 🟢 Частина 1. Turso — створюємо базу даних (5 хв)

> Мета: отримати дві речі — **URL бази** (`libsql://…`) і **auth-токен**. Їх ми вставимо у бекенд.

1. Увійти в Turso:
   ```bash
   turso auth signup     # відкриє браузер; якщо вже є акаунт — turso auth login
   ```

2. Створити базу (назву можна будь-яку):
   ```bash
   turso db create olx-dashboard
   ```
   > 👀 Побачиш повідомлення на кшталт `Created database olx-dashboard in group default…`.

3. Дізнатись **URL** бази:
   ```bash
   turso db show olx-dashboard --url
   ```
   ➡️ Скопіюй рядок виду `libsql://olx-dashboard-<твій-акаунт>.turso.io` — це `TURSO_DATABASE_URL`.

4. Створити **auth-токен**:
   ```bash
   turso db tokens create olx-dashboard
   ```
   ➡️ Скопіюй довгий рядок-токен — це `TURSO_AUTH_TOKEN`.
   > 🔒 Токен — як пароль. Не комітити в git, не світити публічно.

> ℹ️ **Схему таблиць створювати руками НЕ треба.** Бекенд при старті сам викликає `initDb()`,
> який застосовує `server/src/db/schema.sql` (`CREATE TABLE IF NOT EXISTS`). Перший деплой
> бекенду створить усі таблиці в порожній Turso автоматично.
>
> Якщо все ж хочеш подивитись/створити вручну:
> ```bash
> turso db shell olx-dashboard < server/src/db/schema.sql   # застосувати схему
> turso db shell olx-dashboard ".tables"                    # перевірити таблиці
> ```

---

## 🟦 Частина 2. Render — бекенд (Web Service) (8 хв)

> Мета: підняти Fastify-сервер, під'єднати його до Turso, отримати публічний URL і перевірити `/health`.

1. У Render натисни **New +** → **Web Service**.
2. **Connect a repository** → обери свій репозиторій `olx-dashboard` (дай Render доступ, якщо просить).
3. Заповни налаштування:

   | Поле | Значення |
   | --- | --- |
   | **Name** | `olx-dashboard-api` |
   | **Region** | `Frankfurt (EU Central)` (найближче до України) |
   | **Branch** | `main` |
   | **Root Directory** | *(залишити порожнім — це монорепо з npm workspaces)* |
   | **Runtime / Language** | `Node` |
   | **Build Command** | `npm install --include=dev && npm run build -w server` |
   | **Start Command** | `npm run start -w server` |
   | **Instance Type** | **Free** |

   > 💡 `--include=dev` обов'язково: збірка потребує `typescript`/`tsx` (це devDependencies), а
   > Render під час білду може їх пропустити без цього прапорця.

4. Розгорни секцію **Environment Variables** і додай:

   | Key | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | `libsql://…` (з Частини 1, крок 3) |
   | `TURSO_AUTH_TOKEN` | токен (з Частини 1, крок 4) |
   | `NODE_VERSION` | `22` (або прибрати змінну — Render візьме версію з `.nvmrc`) |
   | `OPENROUTER_API_KEY` | *(опційно — лише якщо хочеш авто-режим AI; без нього працює ручний)* |

   > `PORT` додавати **не треба** — Render підставляє його сам, а наш код читає `process.env.PORT`.
   > `WEB_ORIGIN` додамо пізніше (після створення фронтенду), і то опційно.

5. (Бажано) **Health Check Path**: `/health` — Render вважатиме сервіс «живим», коли цей шлях
   віддає `200`.

6. Натисни **Create Web Service**. Render почне білд.
   > 👀 У вкладці **Logs** маєш побачити: `npm install …` → `tsc …` → `Server listening at
   > http://0.0.0.0:10000` (порт може відрізнятись).

7. **Перевірка.** Скопіюй публічний URL сервісу (вгорі сторінки, виду
   `https://olx-dashboard-api.onrender.com`) і відкрий у браузері:
   ```
   https://olx-dashboard-api.onrender.com/health
   ```
   ➡️ Має повернути `{"ok":true}`. 🎉 Бекенд живий і вже під'єднаний до Turso.

   > 📋 Збережи цей URL — він знадобиться для rewrite-правила фронтенду.

---

## 🟪 Частина 3. Render — фронтенд (Static Site) (6 хв)

> Мета: зібрати React і навчити його ходити по `/api/*` на наш бекенд.

1. У Render натисни **New +** → **Static Site**.
2. Обери той самий репозиторій.
3. Заповни:

   | Поле | Значення |
   | --- | --- |
   | **Name** | `olx-dashboard-web` |
   | **Branch** | та сама гілка |
   | **Root Directory** | *(порожнє)* |
   | **Build Command** | `npm install --include=dev && npm run build -w web` |
   | **Publish Directory** | `web/dist` |

4. Натисни **Create Static Site**, дочекайся білду.
   > 👀 У Logs: `vite build` → `✓ built in …` → `Uploading build…`.

5. **Найважливіший крок — Rewrites.** Відкрий сайт → вкладка **Redirects/Rewrites** → додай
   **ДВА** правила саме в такому порядку (порядок критичний — Render застосовує згори вниз):

   | # | Source | Destination | Action |
   | --- | --- | --- | --- |
   | 1 | `/api/*` | `https://olx-dashboard-api.onrender.com/api/*` | **Rewrite** |
   | 2 | `/*` | `/index.html` | **Rewrite** |

   - Правило **1** проксує всі API-виклики на бекенд (підстав СВІЙ URL бекенду з Частини 2).
   - Правило **2** — стандартний SPA-fallback: будь-який інший шлях віддає `index.html`.

   > ⚠️ `Action` має бути саме **Rewrite** (не Redirect!). Redirect змінив би адресу в браузері й
   > зламав би same-origin.

6. Render автоматично передеплоїть сайт із новими правилами (або натисни **Manual Deploy**).

---

## 🔗 Частина 4. (Опційно) Закрутити CORS-гайку

У схемі з rewrite браузер бачить усе як same-origin, тож CORS не вмикається й `WEB_ORIGIN`
**не обов'язковий**. Але якщо захочеш колись звертатись до бекенду напряму (наприклад, із
Postman із браузера) — додай у **бекенд** (Render Web Service → Environment) змінну:

| Key | Value |
| --- | --- |
| `WEB_ORIGIN` | `https://olx-dashboard-web.onrender.com` (URL твого фронтенду) |

…і передеплой бекенд. (Наш код читає `WEB_ORIGIN` для CORS-origin; дефолт — `http://localhost:5173`.)

---

## 🎯 Частина 5. Перевірка живого застосунку

1. Відкрий URL фронтенду: `https://olx-dashboard-web.onrender.com`.
2. Створи пошук (напр. назва «MacBook», запит `macbook air m1`).
3. Натисни **Сканувати**.
   > 👀 За кілька секунд з'являться оголошення. Це означає, що ланцюг
   > **фронт → rewrite → бекенд → OLX → Turso → назад** працює повністю. 🥳
4. (Перевір збереження) Онови сторінку — пошук і оголошення на місці (вони в Turso).
5. (Перевір у БД, опційно):
   ```bash
   turso db shell olx-dashboard "SELECT COUNT(*) FROM listings;"
   ```

---

## 🧊 Частина 6. Нюанси безкоштовного тарифу (важливо!)

- **Холодний старт.** Безкоштовний Render Web Service «засинає» після ~15 хв без запитів.
  Перший запит після сну прокидає його **~30–60 секунд** — сторінка/скан можуть на хвильку
  «задуматись». Це нормально; наступні запити швидкі.
  > 💡 Хочеш менше холодних стартів — можна пінгувати `/health` раз на ~10 хв (напр. безкоштовний
  > UptimeRobot). Але це не обов'язково для особистого використання.
- **Довгі скани не гинуть від засинання:** під час скану сервер сам пінгує свій `/health`
  (`RENDER_EXTERNAL_URL` Render задає автоматично), обірвані скани закриваються на старті — механіка
  в [`business-rules.md`](business-rules.md) → «Довгий скан на free-тарифі Render».
- **Дані не губляться** при засинанні — вони в Turso, а не на диску Render.
- **Turso free** — щедрі ліміти (мільярди рядків-читань/міс), для single-user більш ніж досить.
- **Скан із хмари** робить запити на `olx.ua` із серверів Render — це дозволено й працює (перевірено).

---

## 🔄 Частина 7. Як оновлювати (CI/CD)

Render слухає гілку **`main`**: **кожен merge/push у неї → автоматичний редеплой** обох сервісів.
Тому зміни йдуть через PR із зеленим CI (`.github/workflows/ci.yml`), а не прямим push у `main`.
Тобто далі цикл такий:

```bash
git add -A && git commit -m "…зміни…"
git push
# Render сам перебілдить бекенд і/або фронт; дивись прогрес у вкладці Logs/Events
```

Якщо змінив лише `server/**` — досить редеплою бекенду; якщо `web/**` — фронтенду. Render
зазвичай білдить обидва, що теж ок.

**Після деплою — smoke** (хвилина, лише GET без сесії): `npm run smoke` перевіряє прод — API `/health`,
гейт авторизації (`401` без входу), CORS для фронту, `index.html` і JS-бандл фронту. Інші адреси —
`npm run smoke -- <api-url> [web-url]`. Будь-який ❌ → код виходу `1`.

---

## 🚀 Реліз, відкат, бекап (runbook)

Чекліст для кожного злиття в `main` (злиття = деплой обох сервісів). Правила дозволів — `docs/rules.md` →
«Прод».

### Реліз

1. PR → CI зелений. Червоний — не зливати.
2. Ризикова зміна (схема БД, масовий запис/перерахунок, зміна auto-логіки статусів) → спершу **бекап Turso** (нижче).
3. Злиття (`Create a merge commit`) — лише з «так» людини на конкретний PR.
4. Дочекатися деплою (стартує лише після зеленого CI на merge-коміті): Render → сервіс → **Events** (або Render MCP `list_deploys`) — статус `live`, коміт =
   merge-коміт. Обидва сервіси: `olx-dashboard-api` і `olx-dashboard`.
5. `npm run smoke` — усе ✅ (див. «Частина 7»).
6. Зміна `schema.sql` → у лозі API рядок `Міграція схеми: ALTER TABLE …`. Старт упав з назвою
   `таблиця.колонка` → потрібна ручна міграція (`AGENTS.md` → «Міграції схеми»).
7. Зміна даних чи UI → людина відкриває прод і перевіряє саме змінене; журнал помилок — warn/error у логах Render.

### Відкат

- **Коли:** smoke ❌, `5xx` у логах після деплою, зламаний UI.
- **Швидко — Render Rollback:** сервіс → **Events** → попередній вдалий деплой → **Rollback**. Окремо для API і
  фронту, якщо зламано обидва. Потім `npm run smoke`.
  - ⚠️ Rollback з дашборду **вимикає Auto-Deploy** сервісу (захист від повторного деплою зламаного). Після
    виправлення увімкнути: сервіс → **Settings** → **Auto-Deploy** → «After CI Checks Pass». Rollback через Render API автодеплой не вимикає.
- **Охайно — revert:** `git revert -m 1 <merge-коміт>` окремим PR → CI → злиття. Автодеплой лишається як є.
- **Схема:** відкат коду безпечний — `initDb()` лише додає таблиці й колонки, старий код нові колонки ігнорує.
- **Дані:** відкат коду **не повертає** вже змінені дані (масовий `UPDATE`, хибні auto-disable). Тоді —
  відновлення з бекапу Turso, лише з рішення людини.

### Зміна налаштувань у Render

Змінили в dashboard build/start-команду, тариф, rewrite, Auto-Deploy чи **набір** змінних середовища → у тому ж
PR чи сесії оновити [`render.yaml`](../render.yaml). Звірка: dashboard → виділити обидва сервіси → **Generate
Blueprint** → порівняти з файлом (згенерований YAML не містить значень змінних).

### Бекап Turso

- **Коли:** перед ризиковою зміною (крок 2 релізу) і перед ручною міграцією схеми.
- **Як:** гілка БД `olx-dashboard-bak-YYYYMMDD` з `olx-dashboard` — Turso MCP `create_branch` або
  `turso db create olx-dashboard-bak-YYYYMMDD --from-db olx-dashboard`; одразу ввімкнути захист від
  видалення. Таймаут MCP — [turso-create-branch-timeout](instructions/turso-create-branch-timeout.md).
  Додатково — SQL-дамп у теку поза репо ([secrets-in-sources](instructions/secrets-in-sources.md)).
- **Відновлення:** лише з рішення людини — переключити `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` API на гілку
  (зміна env = редеплой: [render-env-change-redeploys](instructions/render-env-change-redeploys.md)) або перелити
  потрібні таблиці з гілки. Перелік бекапів — `current.md`.
- **Видалення бекапів** — лише за прямою командою людини.

---

## 🛟 Якщо щось пішло не так (troubleshooting)

| Симптом | Причина / рішення |
| --- | --- |
| Білд бекенду падає на `tsc: not found` | У Build Command бракує `--include=dev`. |
| `/health` віддає 502/timeout після паузи | Холодний старт — зачекай ~хвилину, онови. |
| Бекенд у логах: `url is required` / падає на старті | Не задано `TURSO_DATABASE_URL` в Environment бекенду. |
| Фронт відкривається, але дії дають HTML/404 замість JSON | Rewrite `/api/*` не спрацював: перевір, що правило **перше**, тип **Rewrite**, а Destination містить правильний URL бекенду з `/api/*` у кінці. |
| `401 Unauthorized` від Turso у логах бекенду | Невірний/протермінований `TURSO_AUTH_TOKEN` — створи новий: `turso db tokens create olx-dashboard`. |
| Скан падає з мережевою помилкою | Тимчасова відмова OLX/мережі — спробуй ще раз; дані з попередніх сканів лишаються. |

---

## 📌 Шпаргалка (усе головне на одному екрані)

```
TURSO
  turso db create olx-dashboard
  turso db show olx-dashboard --url        → TURSO_DATABASE_URL
  turso db tokens create olx-dashboard     → TURSO_AUTH_TOKEN

RENDER — Web Service (бекенд)
  Build:  npm install --include=dev && npm run build -w server
  Start:  npm run start -w server
  Env:    TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, NODE_VERSION=22
  Health: /health  → {"ok":true}

RENDER — Static Site (фронт)
  Build:    npm install --include=dev && npm run build -w web
  Publish:  web/dist
  Env:      VITE_API_BASE=https://<бекенд>.onrender.com, VITE_GOOGLE_CLIENT_ID
  Rewrite:  /*      →  /index.html                            (Rewrite, SPA-fallback)
  (фактичний прод — API напряму + CORS WEB_ORIGIN; rewrite /api/* не використовується)
  Branch:   main (обидва сервіси)
```

Готово. Насолоджуйся тим, як твій локальний застосунок ожив у хмарі ✨
