# Поточний стан

Стан «на зараз». Перезаписується скілом `session-close` наприкінці кожної сесії. Історія — у
[handoffs/](handoffs/), стабільні правила — у [rules.md](rules.md), бекло — у [parking.md](parking.md).

## Мета зараз

Пріоритети людини (у такому порядку): **(1) базова стабільність**, **(2) мінімальний харнес для
розробки й деплою**, **(3) нова фіча «модель JEV»** (що це — ще не з'ясовано). Історія цін (Етап 3) —
не пріоритет ([P-001](parking.md)).

Порядок роботи (рішення людини, 2026-10-03): **S6 ✅ → S4 ✅ →
[аудит документації](plans/docs-audit.md) → S14 → S10** зі [stability-baseline](plans/stability-baseline.md), потім
харнес **H3–H6** з [dev-deploy-harness](plans/dev-deploy-harness.md).

## Де ми зараз

- **Прод на `main`** (з 2026-09-30) — конфігурація в [deploy-render-turso](deploy-render-turso.md) →
  «Фактичний прод»; історія переведення — [хендоф](handoffs/2026-09-30-render-on-main.md).
- **S9 закрито** (2026-10-03): довгі скани на проді доживають із закритою вкладкою —
  [план](plans/old/scan-keepalive.md).
- Бекап прод-БД від 2026-09-30: гілка Turso `olx-dashboard-bak-20260930` (захищена від видалення) + SQL-дамп
  у теці ключів агента ([secrets-in-sources](instructions/secrets-in-sources.md)).
- Доступи агента: Render MCP і Turso MCP (OAuth, група `default`); що можна без «так» — [rules](rules.md) →
  «Прод». GitHub — через `gh` ([github-cli](instructions/github-cli.md)); зливати PR після зеленого CI агент
  може, коли людина це дозволила в діалозі.
- Харнес розробки (CI, тести, перевірки) — `AGENTS.md` → «Перевірка»; харнес сесій — `AGENTS.md` → «Сесія».

## Активні плани

Що лишилось — рядок `> **Статус:**` і невідмічені кроки кожного плану:
[stability-baseline](plans/stability-baseline.md) (стабільність, S…), [docs-audit](plans/docs-audit.md) (аудит доків + скіл), [dev-deploy-harness](plans/dev-deploy-harness.md)
(харнес деплою, H…), [vitest-setup](plans/vitest-setup.md), [docs-harness](plans/docs-harness.md),
[session-harness](plans/session-harness.md).

## Що враховувати

- Запасного каналу збору немає: HTML-fallback вимкнено (OLX відповідає `403`), ідея обходу — [P-005](parking.md).
- Verify-проба («Перевірити неактивні») теж отримує `403` → нічого не вимикає (S15, рішення людини).
- Пошук `iphone` на проді після глибоких сканів став великим — поведінка UI/`/listings` не перевірена (S14);
  багато «зниклих/старих» там; ручне «Перевірити неактивні» зараз не допоможе (S15).
- Моніторинг скану на проді — [prod-scan-monitoring](instructions/prod-scan-monitoring.md).

## Відкриті питання (чекають людину)

- S15: що робити з verify-пробою під `403` (stability-baseline).
- «Модель JEV» — що це, для чого, як доступна (API / OpenRouter / локально).
- S10: NULL `last_refresh_at` при вичерпаній видачі — пояснення простими словами в
  [vitest-setup](plans/vitest-setup.md) → «Відкриті питання»; перед рішенням — пояснити людині.
- Чи копіювати `OPENROUTER_API_KEY` в `server/.env` з іншого проєкту.
- Коли видаляти бекап-гілку Turso `olx-dashboard-bak-20260930`.
- Чи робити скіл з інструкції `prod-scan-monitoring` (запропоновано 2026-10-03).

## Наступний крок

[docs-audit](plans/docs-audit.md): інструкція + скіл аудиту → звіт-таблиця людині → правки після «так».
