# План: H6 — Dependabot (+ P-004)

> **Статус:** ✅ виконано (2026-10-04) · PR #51; не перевірено: Dependabot в Insights і перші PR (чекають 1-го чи 15-го числа)

## Контекст

H6 з [dev-deploy-harness](../dev-deploy-harness.md): вразливості й застарілі залежності не мають накопичуватись
місяцями (S6). Разом — P-004: CI попереджав, що `actions/checkout@v4` і `actions/setup-node@v4` працюють на
Node 20; актуальні `v7` (рантайм `node24`). Злам для нас у `v5`–`v7` не знайдено: кеш npm задано явно
(`cache: npm`), раннер — GitHub-hosted.

## Файли

- `.github/dependabot.yml` — npm (корінь, workspaces) і `github-actions`, 1-го і 15-го числа (≈ раз на 2 тижні, рішення людини); minor/patch — груповим PR,
  major — окремими.
- `.github/workflows/ci.yml` — `checkout@v7`, `setup-node@v7`.
- Документація: `docs/structure.md`, `docs/development.md`, `docs/parking.md` (P-004 закрито).

## Кроки

- [x] `dependabot.yml`, дії `v7`.
- [x] Документація; P-004 прибрано з парковки.
- [x] PR #51 → CI зелений на `v7` без попередження про Node 20 → «так» людини.
- [ ] Після злиття: у GitHub → Insights → Dependency graph → Dependabot видно обидві екосистеми; перші PR —
      найближчого 1-го чи 15-го числа.

## Test-cases

- [x] CI на PR зелений, у лозі джоба немає попередження про Node 20.
- Dependabot-PR проходить CI; злиття — лише з «так» людини (злиття = деплой).
