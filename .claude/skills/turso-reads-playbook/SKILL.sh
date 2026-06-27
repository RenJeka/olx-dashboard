---
name: turso-reads-playbook
description: "How to measure real Turso rows-read per endpoint/action via Playwright with the user's help"
metadata:
  node_type: memory
  type: reference
  originSessionId: 3885a90e-0aec-4281-a3a4-9020dce33968
---

Playbook для заміру реальних Turso "rows read" живого olx-dashboard через Playwright MCP + допомогу користува
ча.

**Передумова (робить користувач, бо Playwright стартує ізольований Chrome зі своїм профілем):**
1. Я відкриваю `https://olx-dashboard.onrender.com/` у Playwright-браузері.
2. Користувач у ТОМУ Ж вікні входить через Google у застосунок **і** окремо логіниться в Turso (`https://app.
turso.tech/renjeka`). Після цього я перехоплюю керування.
3. Тримати дві вкладки: tab 0 = застосунок, tab 1 = Turso dashboard.

**Як читати лічильник (швидко, без скріншота):**
- На `https://app.turso.tech/renjeka` ряvaluate` →
  `() => document.querySelector('table tbody tr').innerText.replace(/\n/g,' | ')`.
  Формат: `olx-dashboard | Database | <R..`.
- Лічильник оновлюється ЛИШЕ при перезавантаженні сторінки Turso (`browser_navigate` на той же URL), і **агре
гує із затримкою ~30–75 с**. Це головне

**Цикл одного заміру (delta-метод):**
1. Стабільний baseline: після будь-якої активності з БД зачекати ~75 с, потім reload Turso-сторінки і прочита
ти лічильник. Якщо два читання поспіль ой.
2. Ізолювати ОДИН ендпойнт: з вкладки застосунку `browser_evaluate` →
   `async () => { const r = await fetch(nrender.com/api/searches/1/<endpoint>', {
credentials:'include'}); return {status:r.status, ...}; }`
   (`credentials:'include'` несе auth-coк робить сам застосунок).
3. Зачекати ~75 с (агрегація), reload Turso, прочитати. **Δ = вартість цього виклику в reads.**
4. Для "повного reload" — `browser_navigсь 7 `/api`-запитів (`browser_network_req
uests` filter `/api/`), далі той самий delta-цикл.

**Підводні камені / ефективність:**
- НЕ робити кілька викликів між двома чине розкласти.
- Затримка агрегації робить ізольовані per-call числа ±кілька сотень; для впевненого висновку обирати ендпойн
ти з великим контрастом (напр. `/filter- 2449 vs оптимізований 1 прохід ≈ 409 на
408 оголошеннях).
- Render free-tier має cold start (~30–6остою повільний; спершу прогріти будь-яки
м fetch і дочекатися 200.
- `auth/me` спочатку 401 (до Google-логі
- Прискорення на майбутнє: можна зчитувати число напряму з XHR, який робить сам Turso-дашборд (інспектувати й
ого network), щоб не перезавантажувати сно, але швидше за reload+wait.

**Базлайн-числа цього застосунку (пошук иміряно 2026-06-27:**
- `/filter-options`: 2449 → **409** reads після оптимізації (6×).
- Повний reload сторінки: 1642 → **1232*згортання `/stats` у 1 прохід).
- writes на читанні не змінюються (read не пише).
- Лишився headroom у reload: `listings`(s`(~408?) — `/api/searches` ще можна опти
мізувати.

Пов'язано: [[turso-optimization-deployed]]