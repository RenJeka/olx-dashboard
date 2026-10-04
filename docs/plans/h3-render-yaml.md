# План: H3 — `render.yaml` як еталон конфігурації проду

> **Статус:** 🟢 активний (з 2026-10-04) · варіант А (рішення людини 2026-10-04): файл-еталон, Blueprint не підключаємо

## Контекст

H3 з [dev-deploy-harness](dev-deploy-harness.md). Обидва сервіси Render налаштовані вручну в dashboard;
конфіг ніде не зафіксований. Варіанти, які обговорили з людиною 2026-10-04:

| # | Що | Рішення |
|---|---|---|
| А | `render.yaml` — точна копія поточних налаштувань, Blueprint **не** підключаємо | ✅ обрано |
| Б | Підключити Blueprint до наявних сервісів | ✗ ризик дублікатів і перезапису налаштувань |
| В | Без `render.yaml` | ✗ |

Чому не Б (документація Render «Blueprints», через Context7): новий Blueprint, що збігається з наявними
ресурсами, створює **нові** сервіси з суфіксом у назві (дублікати); поле, яке не вказане у файлі, бере
значення за замовчуванням, а не поточне.

Окреме питання — «деплой лише після зеленого CI» (ціль H3). До 2026-10-04 обидва сервіси мали
`autoDeployTrigger: commit` (деплой на кожен коміт). У варіанті А файл цього не вмикає — лише перемикач
Auto-Deploy → «After CI Checks Pass» у dashboard; людина перемкнула обидва 2026-10-04 (тепер `checksPass`).

## Файли

- `render.yaml` (новий, корінь) — еталон; секрети `sync: false`.
- `docs/deploy-render-turso.md` — «Фактичний прод» (посилання на еталон), «Реліз, відкат, бекап» (звірка після змін у dashboard).
- `docs/structure.md`, [dev-deploy-harness](dev-deploy-harness.md) (крок H3).

## Кроки

- [x] Чернетка `render.yaml` з Render API (`list_services`) + код (`process.env.*`) + `deploy-render-turso.md`.
- [x] Людина: Render dashboard → **Generate Blueprint** (2026-10-04). Звірено: додано `AUTH_COOKIE_SECURE`,
      `AUTH_DISABLED`; прибрано `OPENROUTER_API_KEY` (на проді немає) і `NODE_VERSION` фронту (не задано).
- [x] Людина: «так» на Auto-Deploy «After CI Checks Pass» (2026-10-04); у файлі `autoDeployTrigger: checksPass`.
- [x] Людина: перемкнула в dashboard обидва сервіси (2026-10-04); Render API — `autoDeployTrigger: checksPass` в обох.
- [x] Документація (файли вище).
- [ ] `npm run check` → PR → CI → «так» людини.

## Відкрите питання

- На проді API заданий `AUTH_DISABLED` (значення не `true`: smoke 2026-10-04 — API без сесії → `401`).
  Прод його не потребує; прибрати — рішення людини (зміна env = редеплой).

## Test-cases

- [x] `render.yaml` збігається зі згенерованим Render YAML (крім коментарів, порядку, структури проєкту й значень несекретних env).
- [x] `npm run check` зелений.
- [ ] Якщо ввімкнено «After CI Checks Pass»: merge PR → деплой стартує лише після зеленого CI; `npm run smoke` ✅.
