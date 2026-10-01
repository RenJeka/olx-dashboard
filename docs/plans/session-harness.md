# План: харнес сесій і перманентної пам'яті (перенос із youtrack)

> **Статус:** 🟢 активний (з 2026-10-01) · усе перенесено, `npm run check` і headless-виклик `session-start` зелені; лишились ручні test-cases (нова сесія: `/session-start`, `/session-close`; Antigravity).

## Контекст

У проєкті `C:\projects\youtrack` працює харнес сесій: старт і закриття сесії скілами, `current.md`
(стан «на зараз»), `rules.md` (метаправила документації), парковка з номерами `P-NNN`,
`instructions/` (по файлу на пастку), шаблони, скіли `instruction-add` / `parking-add` /
`skill-from-instruction`. В olx-dashboard уже є хендофи, плани зі статусами, `docs:check`, єдине
джерело скілів `skills/` з обгортками. Бракує: стандартного старту/закриття сесії, місця для
поточного стану, бекло з номерами й місця для пасток (зараз вони лише в розділах хендофів «Dead ends»).

Рішення людини (2026-10-01):
- `docs/parking.md` **замість** `docs/plans/TODO`: відкриті пункти TODO переносяться, TODO видаляється.
- `docs/instructions/` — так; одразу заповнити пастками з хендофів.
- `docs/current.md` + `docs/rules.md` (rules.md підключається в `AGENTS.md` через `@docs/rules.md`).
- `handoff-import` і промпт для старих чатів — **не** переносити.
- Формат хендофів лишається olx-івським (як у `docs/handoffs/`), + розділ «Що змінилося в документації».

## Файли

- Нові: `docs/rules.md`, `docs/current.md`, `docs/parking.md`, `docs/instructions/README.md` + файли
  пасток, `docs/templates/{handoff,instruction,parking-entry}.md`.
- Скіли (`skills/<name>/SKILL.md` + `skills/skills.json`): `session-start`, `session-close`,
  `instruction-add`, `parking-add`, `skill-from-instruction` → `npm run skills:sync`.
- Змінені: `AGENTS.md` (старт/закриття сесії, імпорт правил, карта), `docs/structure.md` (дерево
  `docs/`), `docs/development.md` §1 (цикл задачі), `scripts/check-doc-links.mjs` (прибрати TODO).
- Видалено: `docs/plans/TODO`.

## Кроки

- [x] План (цей файл).
- [x] `docs/rules.md` — DRY, джерела істини (код / прод Render+Turso / CI / репо), кількості, мова,
      секрети, прод (лише читання без «так»), хендофи, парковка, інструкції й скіли, сесії, git.
- [x] `docs/templates/` — хендоф (формат olx), інструкція, запис парковки.
- [x] `docs/parking.md` — відкриті пункти TODO як P-001…; `docs/plans/TODO` видалити.
- [x] `docs/instructions/` — README + пастки з хендофів 2026-09-30 (завантаження AGENTS.md, секрети,
      `git checkout --`, `| tail`, CRLF, `.mts`, env на Render, `create_branch` у Turso, абсолютні шляхи
      для людини, PR без `gh`).
- [x] `docs/current.md` — стан з останнього хендофа й активних планів.
- [x] Скіли в `skills/` + маніфест + `npm run skills:sync`.
- [x] `AGENTS.md`, `docs/structure.md`, `docs/development.md`, `scripts/check-doc-links.mjs`.
- [x] Перевірка: `npm run check`; headless-виклик `session-start` (`claude -p`, як `development.md` §6).

- [x] DRY-аудит (запит людини): у `docs/rules.md` — таблиця «Де живе факт»; повтори в `AGENTS.md`,
      `rules.md`, `current.md`, `development.md`, `structure.md`, інструкціях і скілах замінено
      посиланнями на джерело (плани, сесії, секрети, Turso, git, хендофи, прод). Хендофи й `plans/old/`
      не чіпали (знімки). Дубль у пам'яті агента (абсолютні шляхи) видалено — джерело `absolute-paths-for-user`.
- [x] `gh` встановлено й залогінено (2026-10-01): інструкцію `github-pr-links` замінено на `github-cli`,
      `session-start` дивиться CI/PR через `gh`; нова пастка `docs-check-untracked-files` (CI PR #34).

## Test-cases

- `npm run check` зелений (`skills:check` бачить 5 нових скілів, `docs:check` — 0 битих).
- `claude -p` зі скілом `session-start` → доходить до `skills/session-start/SKILL.md`.
- `grep -rn "plans/TODO"` у живих доках (без `docs/plans/old/` і `docs/handoffs/`) — порожньо.
- Ручне (людина): нова сесія → `/session-start` дає «Де ми / Що змінилося / Пропоную»; кінець сесії →
  `/session-close` спершу показує план-таблицю і нічого не пише без підтвердження.
