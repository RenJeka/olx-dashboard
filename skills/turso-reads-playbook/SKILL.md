---
name: turso-reads-playbook
description: "How to measure real Turso rows-read per endpoint/action via Playwright with the user's help"
metadata:
  node_type: memory
  type: reference
  originSessionId: 3885a90e-0aec-4281-a3a4-9020dce33968
---

Playbook для заміру реальних Turso "rows read" живого olx-dashboard через Playwright MCP + допомогу користувача.

**Передумова (робить користувач, бо Playwright стартує ізольований Chrome зі своїм профілем):**
1. Я відкриваю `https://olx-dashboard.onrender.com/` у Playwright-браузері.
2. Користувач у ТОМУ Ж вікні входить через Google у застосунок **і** окремо логіниться в Turso (`https://app.turso.tech/renjeka`). Після цього я перехоплюю керування.
3. Тримати дві вкладки: tab 0 = застосунок, tab 1 = Turso dashboard.

**КРИТИЧНО — API на ОКРЕМОМУ хості:** фронт = `https://olx-dashboard.onrender.com`, але бекенд/БД = **`https://olx-dashboard-api.onrender.com`**. Усі `/api/...` бити саме на api-хост (інакше 401 «Не авторизовано» від фронт-хоста). Auth = httpOnly-кукі (cross-site), `credentials:'include'` несе її; у localStorage/`document.cookie` токена НЕ видно (там лише `g_state` від Google). Логін-перевірка: `fetch('https://olx-dashboard-api.onrender.com/api/auth/me',{credentials:'include'})` → 200 + email.

**Як читати лічильник (швидко, без скріншота):**
- На `https://app.turso.tech/renjeka` читати клітинки рядка через `browser_evaluate` →
  `() => { const c=[...document.querySelectorAll('table tbody tr td')].map(t=>t.innerText.trim()); return {reads:c[2], writes:c[3]}; }`.
  Колонки: `[0]=name [1]=type [2]=Rows read [3]=Rows written [4]=…storage`. Числа з пробілами-роздільниками («48 647») — прибрати пробіли перед відніманням.
- Лічильник оновлюється ЛИШЕ при перезавантаженні сторінки Turso (`browser_navigate` на той же URL), і **агрегує із затримкою ~30–75 с**. Це головне джерело повільності циклу.

**Цикл одного заміру (delta-метод):** попереднє читання лічильника = baseline для наступної дії, ТОЖ окремий baseline щоразу НЕ потрібен — головне «одна дія між двома читаннями». Послідовність: read R0 → дія A → wait ~85с → read R1 (ΔA=R1−R0) → дія B → wait → read R2 (ΔB) … Чекати фоновим `sleep 85` (foreground sleep заблоковано).

**Два режими виклику дії — обирати свідомо:**
- **Прямий fetch (ізоляція per-endpoint):** з вкладки застосунку `browser_evaluate` →
  `async () => { const r = await fetch('https://olx-dashboard-api.onrender.com/api/searches/1/<endpoint>', {credentials:'include'}); return {status:r.status}; }`.
  Чисто міряє ОДИН ендпойнт, але НЕ ловить «зайвих»/подвійних викликів фронту.
- **UI-driven (реальна поведінка — ОБИРАТИ, коли шукаємо що оптимізувати):** дію робити КЛІКОМ у UI (вибір пошуку в сайдбарі, відкриття панелі фільтрів, edit-нотатки), потім `browser_network_requests` (filter `olx-dashboard-api\.onrender\.com`) показує, ЯКІ запити і СКІЛЬКИ разів фронт реально вистрілив (видно дублі/префетч/refetch), а Turso-Δ — сумарну вартість. Поєднання «список запитів + Δ reads» = головний інструмент пошуку прихованих коштів.
4. Для "повного reload" — `browser_navigate` на застосунок (`browser_network_requests` для списку), далі той самий delta-цикл. Увага: на cold reload пошук НЕ авто-вибирається (порожній стан) — стартові запити дешеві; уся вартість приходить при кліку на пошук.

**Підводні камені / ефективність:**
- НЕ робити кілька викликів між двома читаннями лічильника — інакше Δ не розкласти на окремі ендпойнти.
- Затримка агрегації робить ізольовані per-call числа ±кілька сотень; для впевненого висновку обирати ендпойнти з великим контрастом.
- Render free-tier має cold start (~30–60 с): перший запит після простою повільний; спершу прогріти будь-яким fetch і дочекатися 200.
- `auth/me` спочатку 401 (до Google-логіну) — це нормально.
- Прискорення на майбутнє: можна зчитувати число напряму з XHR, який робить сам Turso-дашборд (інспектувати його network), щоб не перезавантажувати сторінку — складніше, але швидше за reload+wait.

**Що вже відомо (замір 2026-06-27, числа застаріли — міряти заново):** найдорожча дія — відкриття пошуку, головний внесок — `GET /listings` (≈2 reads на рядок: індекс по `search_id` + добір рядків); `/filter-options` викликається лише при відкритті панелі фільтрів; редагування нотатки — один write без refetch.

**Замір writes (дешево, без повного скану):** один `PATCH /api/listings/:id` з нотаткою = одна мутація. UI: клік «— додати нотатку —» у рядку → діалог (textbox «Нотатка...» + кнопка «Зберегти»). Delta-цикл по колонці **Rows written** (не Rows read).

**Перед оптимізацією `/listings`** (`server/src/routes/listings.ts`) — подивитись реальний план (`EXPLAIN QUERY PLAN`) і розподіл рядків по пошуках: коли один пошук — майже вся таблиця, індекс по `search_id` дорожчий за повний прохід.
