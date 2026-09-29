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
- Затримка агрегації робить ізольовані per-call числа ±кілька сотень; для впевненого висновку обирати ендпойнти з великим контрастом (напр. `/filter-options` 2449 vs оптимізований 1 прохід ≈ 409 на 408 оголошеннях).
- Render free-tier має cold start (~30–60 с): перший запит після простою повільний; спершу прогріти будь-яким fetch і дочекатися 200.
- `auth/me` спочатку 401 (до Google-логіну) — це нормально.
- Прискорення на майбутнє: можна зчитувати число напряму з XHR, який робить сам Turso-дашборд (інспектувати його network), щоб не перезавантажувати сторінку — складніше, але швидше за reload+wait.

**Базлайн-числа цього застосунку (пошук #1 «mac mini», 408 оголошень) — повний прогін 2026-06-27:**
Per-endpoint (прямий fetch):
- `/listings`: **816** reads (≈2× кількості рядків — НАЙВАЖЧИЙ, головний кандидат на оптимізацію; 816≈2×408 натякає на non-covering index: прохід індексом по `search_id` + 408 row-lookup'ів).
- `/stats`: **410** reads (повний прохід по listings).
- `/filter-options`: **409** reads (раніше 2449 → оптимізовано 6×).
- `/api/searches`: **2** reads (1 пошук).
- `/relevance/target`: **~2** reads.

UI-driven (реальні набори запитів):
- Cold reload, пошук НЕ вибрано: **4 reads** усього — `auth/me`+`searches`+`projects`+`analysis/status`, без дублів.
- Клік на пошук у сайдбарі: **1228 reads** = `listings`816 + `stats`410 + `relevance/target`2. `filter-options` тут НЕ викликається (він on-demand при відкритті панелі фільтрів). Дублів/refetch немає.
- Повний reload + перегляд пошуку ≈ **1232 reads** (4+1228) — збігається зі старим базлайном.
- Edit нотатки (UI «Зберегти»): лише `PATCH /api/listings/:id`, БЕЗ refetch усіх listings (кеш оновлюється оптимістично) → **1 write + ~3 reads** (PATCH робить `SELECT id WHERE id=?`). read-only дії = **0 writes**.

**Замір writes (дешево, без повного скану):** один `PATCH /api/listings/:id` з нотаткою = одна мутація. UI: клік «— додати нотатку —» у рядку → діалог (textbox «Нотатка...» + кнопка «Зберегти»). Delta-цикл по колонці **Rows written** (не Rows read): перший рядок мав `listing id=402`. Підтверджено 2026-06-27: +1 write, +3 reads.

**Головний наступний крок оптимізації — `/listings` 816 reads на 408 рядків (`server/src/routes/listings.ts`, `SELECT <широкі колонки> WHERE search_id=? ORDER BY first_seen_at DESC`):**
- Індекси listings (schema.sql §78-82): `(search_id,status)`, `(search_id,last_refresh_at)`, `(search_id,last_seen_at)`. На `first_seen_at` індексу НЕМАЄ.
- Звідки 816: планувальник бере один із `(search_id,…)`-індексів (408 index-рядків), добирає 408 table-рядків за широкими колонками = ~816. Покривний індекс тут НЕпрактичний (колонок забагато).
- Нюанс single-search БД: усі 408 рядків належать пошуку #1, тож індекс по `search_id` нічого не відсіює — суто додає 408 reads. **Full table scan (408) був би дешевший за index+lookup (816)** саме для «один пошук = майже вся таблиця». З кількома пошуками індекс знову вигідний. Тобто це НЕ однозначний «додай індекс» — перед фіксом зважити розподіл рядків по пошуках і реальний план (`EXPLAIN QUERY PLAN`).

Пов'язано: [[turso-optimization-deployed]]
