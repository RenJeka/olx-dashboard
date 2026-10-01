# Handoff: нові доступи Render/Turso, прод переведено на `main`

2026-09-30 · сесія: відкликання старих ключів → Render MCP + Turso MCP (OAuth) → бекап прод-БД →
прогін `main` на копії → Render API + Static Site на `main` → smoke → закриття «вічних» сканів.
Попередній handoff — `docs/handoffs/2026-09-30-stability-harness-access.md`.

## Objective

Пріоритети користувача без змін: **(1) базова стабільність**, **(2) мінімальний харнес для розробки
й деплою**, **(3) фіча «модель JEV»**. Ця сесія закрила головний ризик стабільності — прод жив на
застарілій feature-гілці.

## Current state (ви тут)

- **Прод на `main`:** обидва Render-сервіси — гілка `main`, коміт `5448b92`, autoDeploy, Node 22.23.3.
  API `dep-dauc7cou01pc73em3n9g`, Static Site `dep-dauc9rfavr4c738kk3g0` — live. Rewrite `/api/*` прибрано.
- Smoke пройдено: `/health` 200, `/api/*` без сесії 401, CORS з фронту OK, людина залогінилась через
  Google — таблиця вантажиться, «Журнал» порожній. Тестовий звичайний скан `iphone` (run 25) — OK.
- Прод-БД: з'явилась `app_logs` (0 рядків); `iphone` 836 → **1535** оголошень (+699 — синоніми 10–16,
  які обірваний липневий deep-скан 24 так і не зібрав); «вічні» скани 18, 19, 20, 23, 24 закрито з `error`.
- Робоча гілка `handoff-2026-09-30` — **незакомічені** зміни: `.gitignore` (`*.env`), доки (`deploy-render-turso.md`,
  `dev-deploy-harness.md`, `stability-baseline.md`), `docs/plans/old/render-to-main.md` (новий), цей
  handoff; .claude/settings.json — untracked, не з цієї сесії (не чіпав).

## Decisions (і чому)

- **Turso MCP — через OAuth-плагін** (`turso@turso`), доступ обмежений групою `default`. Platform-токен
  не потрібен: бекап-гілки, захист від видалення, SQL — усе через MCP.
- **Захист від видалення** увімкнено на `olx-dashboard` і на бекапі `olx-dashboard-bak-20260930`.
- **Перед деплоєм — прогін `main` на копії** (`olx-dashboard-test-main`, токен лише на копію, перевірено:
  прод → 401). Копію й токен після перевірки видалено (за рішенням людини).
- **Зміни на Render робила людина в dashboard** (Render MCP не вміє міняти гілку); `NODE_VERSION`
  змінювали через **Save only**, щоб не передеплоїти стару гілку.
- **«Вічні» скани закрито як помилку** (`finished_at` + `error`), а не видалено: `found` у них NULL, тож
  базою для наступних сканів вони не стають; зібрані тоді оголошення лишились.
- **PR #30 і гілку `claude/turso-write-optimization-x920p8` не чіпали** — рішення людини; на прод уже не впливає.
- Гайд `deploy-render-turso.md` не переписували повністю — додано блок «Фактичний прод» (API напряму через
  `VITE_API_BASE` + CORS `WEB_ORIGIN`, назва `olx-dashboard`, гілка `main`); повний перепис — разом із H3 `render.yaml`.

## Dead ends — не повторювати

- **`$env:USERPROFILE` в інструкціях для людини:** її PowerShell запущений від адміністратора під **іншим
  обліковим записом** → `notepad "$env:USERPROFILE\..."` відкриває файл іншого профілю, секрет «губиться».
  Давати **лише абсолютні шляхи** `C:\Users\dell\.config\olx-dashboard\...` і після «зберіг» перевіряти
  mtime/довжину файлу зі свого боку. (Так само раз ключ опинився в `C:\GIT\olx-dashboard\render.env` —
  після цього в `.gitignore` додано `*.env` — git ігнорує такі файли будь-де в репо.)
- **Turso MCP `create_branch`** повертає таймаут, але гілка створюється асинхронно (~1–2 хв); повтор → 409.
  Перед повтором — `get_database`.
- **`sed -i` у Git Bash** прибирає CRLF → змінює весь файл. Для CRLF-доків — node-скрипт (LF → заміна → CRLF).
- Автокласифікатор дозволів інколи дає «no verdict» — транзієнтно, повторити пізніше.

## Artifacts

- `docs/plans/old/render-to-main.md` — план переведення, ✅ (усі кроки й цифри перевірок).
- `docs/deploy-render-turso.md` — блок «Фактичний прод», гілка `main`, шпаргалка (draft до H3).
- `docs/plans/dev-deploy-harness.md` — H1, H2 ✅; H3–H6 ⏳.
- `docs/plans/stability-baseline.md` — S2, S5, S12 ✅; S9 частково (закрито «вічні» скани; повторний deep-скан ⏳).
- Поза git (`C:\Users\dell\.config\olx-dashboard\`): `render.env` (новий ключ `rnd_qeyp…`), `turso.env`
  (`TURSO_DB_URL` + read-only токен БД до ~2026-10-07; рядок відкликаного `TURSO_API_TOKEN` прибрано),
  `backups/olx-dashboard-20260930.sql` (20 МБ, перевірено відновленням).
- Turso: `olx-dashboard-bak-20260930` — гілка-бекап від 2026-09-30T07:01:30Z (listings 4693, projects 3,
  scan_runs 24, searches 4), delete-protected.
- Пам'ять агента: `user-powershell-elevated-profile` (абсолютні шляхи).

## Verbatim essentials

- Render workspace `tea-d8mh9lrbc2fs73dvtbv0` («My Workspace»); API `srv-d8ujfrnlk1mc73fuberg`
  (`https://olx-dashboard-api.onrender.com`), Static Site `srv-d8ujhi1o3t8c73drge0g`
  (`https://olx-dashboard.onrender.com`).
- Turso: org `renjeka`, група `default`, БД `olx-dashboard`, `libsql://olx-dashboard-renjeka.aws-eu-west-1.turso.io`.
- SQL закриття сканів: `UPDATE scan_runs SET finished_at='2026-09-30T08:30:00.000Z', error='Скан обірвано
  (процес зупинено до фіксу scan-failure-recovery); закрито вручну 2026-09-30' WHERE id IN (18,19,20,23,24)
  AND finished_at IS NULL` → 5 рядків.
- Скан 25 (`iphone`, normal): 34/34 GraphQL-запити, 16 варіантів (основний + синоніми, паузи 3–6 с —
  за `business-rules.md`), found 819, raw 1241, +699 нових; warning «вікно покриття пропущено» — очікуваний.
  UI: «Зниклі/Старі» 721.
- Відкат: гілку сервісів назад на `claude/turso-write-optimization-x920p8` (live тоді `ec44940`);
  дані — гілка-бекап або SQL-дамп. Автоміграція лише додає таблиці/колонки.

## Working preferences

- Відповіді українською; коміти/PR — англійською; після змін пропонувати текст коміту.
- **Людині — конкретні покрокові інструкції** з клікабельними посиланнями й **абсолютними шляхами**.
- Секрети — не в чат: людина кладе їх у файл, агент читає з файлу й показує лише маску (`rnd_qeyp…tPKN`).
- Стан на Render/Turso змінювати лише після явного «так»; читання — вільно; видалення — лише за прямою
  командою. У PR — без помітки про Claude Code. Гілки не видаляти. Merge — «Create a merge commit».

## Open items

- **Next step:** закомітити поточні зміни доків/handoff на `handoff-2026-09-30` → PR у `main`.
  Увага: merge у `main` = автодеплой обох сервісів (лише доки — безпечно).
- **Then:**
  1. PR #30 / гілка `claude/turso-write-optimization-x920p8` — **лишаємо** (людина гілки зазвичай не видаляє).
  2. S9: повторний **глибокий** скан на проді — чи доживає і чи зберігає часткове (з «так» людини).
  3. `iphone`: «Перевірити неактивні» (721 «зниклих/старих» — авто-вимкнення для синонімів пропускається).
  4. `dev-deploy-harness.md`: H3 `render.yaml` (+ повний перепис гайду деплою під API-напряму), H4 `npm run smoke`,
     H5 runbook (реліз/відкат/бекап — сценарій цієї сесії), H6 Dependabot.
  5. `stability-baseline.md`: S4 (HTML-fallback 403), S6 `npm audit fix`, S10.
  6. Коли бекап більше не потрібен — видалити `olx-dashboard-bak-20260930` (спершу зняти delete-protection; лише за командою).
  7. Опційно: `gh` (GitHub CLI) для PR.
- **Unresolved questions (чекають людину, з попереднього handoff):** «модель JEV» — що це; NULL
  `last_refresh_at` при `exhausted` — задум чи баг; копіювати `OPENROUTER_API_KEY` у `server/.env`?
- **Blocked:** ручна перевірка скілів в Antigravity — потребує людини.

## Suggested opening prompt

> Прочитай `AGENTS.md` і `docs/handoffs/2026-09-30-render-on-main.md`. Прод уже на `main`. Почнемо з
> «Next step»: закоміть зміни доків і дай посилання на PR. Далі — S9: повторний глибокий скан на проді
> (спершу скажи, що саме запускаємо, і чекай мого «так»).
