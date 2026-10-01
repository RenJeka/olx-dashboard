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
  «Прод». `gh` не встановлено ([github-pr-links](instructions/github-pr-links.md)).
- Харнес розробки (CI, тести, перевірки) — `AGENTS.md` → «Перевірка»; харнес сесій — `AGENTS.md` → «Сесія».
- Робоча гілка `handoff-2026-09-30`: закомічено доки сесії 2026-09-30 і харнес сесій, у `main` ще не злито. Локальний untracked-файл налаштувань Claude Code (`.claude/` → settings) — не з цих сесій, рішення за людиною.

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

Запушити `handoff-2026-09-30` і відкрити PR у `main`
([github-pr-links](instructions/github-pr-links.md)). Далі — S9 у stability-baseline: повторний глибокий скан на проді.
