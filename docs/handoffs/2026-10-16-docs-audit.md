# Handoff: аудит документації, скіл docs-audit, реліз PR #74

2026-10-16 · сесія: скіл `find-skills` (пошук сторонніх скілів) → аудит доків скілом `docs-audit` → правки + нове
правило про точні значення → `gh` на робочому ПК → PR #74 злито й задеплоєно.
Попередній handoff — `docs/handoffs/2026-10-16-db-copy-prod.md`.

## Objective

Привести документацію до актуального стану й зробити скіл `docs-audit` точнішим: одне джерело правди, перехресні
посилання, без змінних чисел.

## Current state (ви тут)

- `main` = `e19e14d` (merge PR #74: `db:copy-prod` + аудит). Render: `olx-dashboard` і `olx-dashboard-api` — `live`
  на `e19e14d` (деплой 2026-10-16 ≈ 13:26 UTC); `npm run smoke` — усе ✅.
- Гілка закриття `docs/close-2026-10-16` (від `e19e14d`) — цей хендоф, `current.md`, дві інструкції.
- `feat/db-copy-prod` злита, не видалена (без прямої команди).
- Активних планів немає.

## Decisions (і чому)

- **Без змінних точних значень у живих доках** (`rules.md` п. 2): версії пакетів (джерело — `package.json`, у
  тексті лише версія-обмеження), номери PR і хеші (хендофи, `plans/old/`), значення верстки — людина.
- **Плани `jev-model`, `jev-threshold-setting` → ✅ і `old/`** з приміткою про невиконані ручні перевірки — людина.
- **Стан, різний між ПК, позначати «домашній ПК» (`C:\Users\dell`) / «робочий ПК» (`C:\Users\y.petrushenko`)** — людина.
- **P-011 (Redis) лишити з числами** тарифу й замірів — людина.
- **`gh` встановити на робочому ПК** — людина; вхід `RenJeka` пройдено (код введено з телефона).
- **Виконані записи парковки прибирати повністю** — людина; у цій сесії таких не було (оновлено лише умови P-001,
  P-009, P-013, P-016), правило внесено в `docs-audit`.

## Dead ends — не повторювати

- **Python-скрипт у bash-heredoc на робочому ПК:** Python не встановлено, ланцюжок пішов далі (`git mv` без правок
  статусів) → [scripted-edit-assert](../instructions/scripted-edit-assert.md).
- **`gh` одразу після `winget install` у Git Bash:** не в PATH поточної сесії → повний шлях
  ([github-cli](../instructions/github-cli.md)).

## Artifacts

- PR #74 — злито (merge commit `e19e14d`), задеплоєно, smoke ✅.
- Скіл `find-skills` (vercel-labs/skills) — встановлено глобально на робочому ПК: `C:\Users\y.petrushenko\.agents\skills\find-skills`,
  symlink `C:\Users\y.petrushenko\.claude\skills\find-skills` (поза репо).
- GitHub CLI 2.102.0 — робочий ПК, вхід `RenJeka`, протокол ssh.

## Verbatim essentials

- CI `main` для `e19e14d`: run `38907620062` — success.
- Render deploys: API `dep-db92bfjrjlhs73bi1870`, фронт `dep-db92bfjrjlhs73bi18e0` — `live`.
- Механічні перевірки аудиту — `docs/instructions/docs-audit.md` п. 2.

## Open items

- **Next step:** людина на проді — test-case 3 [llm-haiku-prompt-audit](../plans/old/llm-haiku-prompt-audit.md)
  (модель Haiku в налаштуваннях, «Мінуси» → «Згенерувати» без плюсів) і «Згрупувати автоматично».
- **Then:** ручні перевірки Jev — примітки [jev-model](../plans/old/jev-model.md), [jev-threshold-setting](../plans/old/jev-threshold-setting.md).
- **Unresolved questions (чекають людину):** чи видаляти порожній `server/data/olx-bak-2026-10-16T12-28-23-237Z.db`;
  решта — [current](../current.md) → «Відкриті питання».

## Що змінилося в документації

- Інструкції: `docs-audit` (переписано: механічні перевірки, одне джерело, посилання, закрита парковка),
  `github-cli`, `secrets-in-sources`, `absolute-paths-for-user`, `scripted-edit-assert`.
- Правила: `rules.md` п. 2 — без версій пакетів, номерів PR, хешів і значень верстки в живих доках.
- Парковка: оновлено умови P-001, P-009, P-013, P-016, P-012 · закриті: немає.
- Плани: `jev-model`, `jev-threshold-setting` ✅ → `old/`.
- Скіли: `docs-audit` — опис оновлено, обгортки перегенеровано.
- Інше: `architecture.md`, `structure.md`, `olx-monitor-spec.md` §3.4, `README.md`, `deploy-render-turso.md`
  «Частина 7»; коментарі коду → `docs/plans/old/`.

## Suggested opening prompt

> Прочитай AGENTS.md, docs/current.md і docs/handoffs/2026-10-16-docs-audit.md. Продовжимо з наступного кроку.
