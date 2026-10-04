# Поточний стан

Стан «на зараз». Перезаписується скілом `session-close` наприкінці кожної сесії. Історія — у
[handoffs/](handoffs/), стабільні правила — у [rules.md](rules.md), бекло — у [parking.md](parking.md).

## Мета зараз

Пріоритети людини (у такому порядку): **(1) базова стабільність**, **(2) мінімальний харнес для
розробки й деплою**, **(3) нова фіча «модель JEV»** (що це — ще не з'ясовано). Історія цін (Етап 3) —
не пріоритет ([P-001](parking.md)).

Стабільність закрито ([stability-baseline](plans/old/stability-baseline.md) ✅, 2026-10-04; S15 ⏸ → P-005,
лагодження швидкості S17 → P-010). Харнес: H1, H2, H4–H6 ✅, лишився **H3** з
[dev-deploy-harness](plans/dev-deploy-harness.md); далі — «модель JEV».

## Де ми зараз

- **Прод на `main`** (з 2026-09-30) — конфігурація в [deploy-render-turso](deploy-render-turso.md) →
  «Фактичний прод»; історія переведення — [хендоф](handoffs/2026-09-30-render-on-main.md).
- Останній хендоф — [2026-10-04](handoffs/2026-10-04-s17-s10-harness.md): замір S17, рішення S10, харнес H4–H6, Dependabot.
- Бекап прод-БД від 2026-09-30: гілка Turso `olx-dashboard-bak-20260930` (захищена від видалення) + SQL-дамп
  у теці ключів агента ([secrets-in-sources](instructions/secrets-in-sources.md)).
- Доступи агента: Render MCP і Turso MCP (OAuth, група `default`); що можна без «так» — [rules](rules.md) →
  «Прод». GitHub — через `gh` ([github-cli](instructions/github-cli.md)); зливати PR після зеленого CI агент
  може, коли людина це дозволила в діалозі.
- Харнес розробки (CI, тести, перевірки) — `AGENTS.md` → «Перевірка»; харнес сесій — `AGENTS.md` → «Сесія».
- Реліз: чекліст, відкат і бекап Turso — [deploy-render-turso](deploy-render-turso.md) → «Реліз, відкат, бекап»;
  після деплою — `npm run smoke`.
- Dependabot — 1-го і 15-го числа PR з minor/patch (npm) і оновленнями дій CI; злиття = деплой, лише з «так»
  людини; major npm — вручну ([P-012](parking.md)).

## Активні плани

Що лишилось — рядок `> **Статус:**` і невідмічені кроки кожного плану:
[dev-deploy-harness](plans/dev-deploy-harness.md) (харнес деплою, H3).

## Що враховувати

- Запасного каналу збору немає: HTML-fallback вимкнено (OLX відповідає `403`), ідея обходу — [P-005](parking.md).
- Verify-проба («Перевірити неактивні») теж отримує `403` → нічого не вимикає (S15, відкладено до P-005).
- Великий пошук `iphone` на проді: таблиця й пошук в описі повільні — переважно очікування даних із Turso,
  не CPU (замір S17 — у [stability-baseline](plans/old/stability-baseline.md)); лагодження — [P-010](parking.md), [P-008](parking.md), ідея кешу — [P-011](parking.md).
- Нові задачі з документацією — правило «жодних кількостей» ([rules](rules.md) п. 2); аудит — скіл `docs-audit`.
- Моніторинг скану на проді — [prod-scan-monitoring](instructions/prod-scan-monitoring.md).

## Відкриті питання (чекають людину)

- «Модель JEV» — що це, для чого, як доступна (API / OpenRouter / локально).
- Чи копіювати `OPENROUTER_API_KEY` в `server/.env` з іншого проєкту.
- Коли видаляти бекап-гілку Turso `olx-dashboard-bak-20260930`.
- Чи робити скіл з інструкції `prod-scan-monitoring` (запропоновано 2026-10-03) і скіл `prod-release` з runbook релізу (2026-10-04).
- Antigravity — коли робити [P-009](parking.md) (знімок скілів на вимогу).

## Наступний крок

H3 у [dev-deploy-harness](plans/dev-deploy-harness.md): `render.yaml` (Blueprint) для обох сервісів — спершу
пояснити людині простими словами, що дасть і чим ризикує підключення до наявних сервісів (дублікати), дати
варіанти й чекати «так»; застосування в Render — людина.
