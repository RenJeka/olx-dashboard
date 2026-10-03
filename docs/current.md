# Поточний стан

Стан «на зараз». Перезаписується скілом `session-close` наприкінці кожної сесії. Історія — у
[handoffs/](handoffs/), стабільні правила — у [rules.md](rules.md), бекло — у [parking.md](parking.md).

## Мета зараз

Пріоритети людини (у такому порядку): **(1) базова стабільність**, **(2) мінімальний харнес для
розробки й деплою**, **(3) нова фіча «модель JEV»** (що це — ще не з'ясовано). Історія цін (Етап 3) —
не пріоритет ([P-001](parking.md)).

## Де ми зараз

- **Прод на `main`** (з 2026-09-30) — конфігурація в [deploy-render-turso](deploy-render-turso.md) →
  «Фактичний прод»; історія переведення — [хендоф](handoffs/2026-09-30-render-on-main.md).
- Бекап прод-БД від 2026-09-30: гілка Turso `olx-dashboard-bak-20260930` (захищена від видалення) + SQL-дамп
  у теці ключів агента ([secrets-in-sources](instructions/secrets-in-sources.md)).
- Доступи агента: Render MCP і Turso MCP (OAuth, група `default`); що можна без «так» — [rules](rules.md) →
  «Прод». GitHub — через `gh` ([github-cli](instructions/github-cli.md)).
- Харнес розробки (CI, тести, перевірки) — `AGENTS.md` → «Перевірка»; харнес сесій — `AGENTS.md` → «Сесія».
- **S9 закрито** (2026-10-03): довгі скани більше не гинуть від засинання free-тарифу Render (самопінг під час
  скану + закриття обірваних на старті) — [план](plans/old/scan-keepalive.md), перевірено на проді.
- Пошук `iphone` на проді після глибоких сканів має на порядок більше оголошень, ніж до них; як UI і
  `/listings` поводяться на такому обсязі (швидкість, пам'ять сервера, читання Turso) — ще не перевірено.
- Локальний untracked-файл налаштувань Claude Code (`.claude/` → settings) — не з цих сесій, рішення за людиною.

## Активні плани

Що лишилось — рядок `> **Статус:**` і невідмічені кроки кожного плану:
[stability-baseline](plans/stability-baseline.md) (стабільність, S…), [dev-deploy-harness](plans/dev-deploy-harness.md)
(харнес деплою, H…), [vitest-setup](plans/vitest-setup.md), [docs-harness](plans/docs-harness.md),
[session-harness](plans/session-harness.md).

## Що враховувати

- Запасного каналу збору фактично немає: HTML-fallback OLX отримує `403` — stability-baseline, S4.
- Пошук `iphone` на проді: після синонімного скану багато «зниклих/старих» — потрібне ручне «Перевірити
  неактивні» (чому — [business-rules](business-rules.md), авто-disable лише після повного скану).

## Відкриті питання (чекають людину)

- «Модель JEV» — що це, для чого, як доступна (API / OpenRouter / локально).
- NULL `last_refresh_at` при `exhausted` — задум чи баг ([vitest-setup](plans/vitest-setup.md)).
- Чи копіювати `OPENROUTER_API_KEY` в `server/.env` з іншого проєкту.
- Коли видаляти бекап-гілку Turso `olx-dashboard-bak-20260930`.

## Наступний крок

Вибір людини серед решти стабільності ([stability-baseline](plans/stability-baseline.md)): S6 `npm audit fix`,
S4 HTML-fallback (`403`), S10 (рішення про NULL `last_refresh_at`), перевірка UI на великому пошуку `iphone`;
далі — харнес деплою H3–H6 ([dev-deploy-harness](plans/dev-deploy-harness.md)).
