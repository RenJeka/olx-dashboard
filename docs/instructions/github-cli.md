---
name: github-cli
created: 2026-10-01
source: хендоф 2026-09-30-stability-harness-access; сесія 2026-10-01 (встановлення `gh`)
---
# GitHub: PR і CI через `gh`

## Коли застосовувати
Треба відкрити PR, подивитись CI чи логи впалого прогону.

## Що робити
- `gh` встановлено (`winget install GitHub.cli`), вхід — акаунт `RenJeka`. Якщо `gh` не знаходиться в
  PATH (сесія, відкрита до встановлення) — повний шлях `C:\Program Files\GitHub CLI\gh.exe`.
  Перевірка: `gh auth status`.
- PR: `gh pr create --base main --head <гілка> --title "…" --body-file -` (вимоги до тексту —
  [`docs/rules.md`](../rules.md) → «Git»). Перед створенням — зелений CI гілки.
- CI: `gh run list --branch <гілка> --limit 1`; дочекатись — `gh run watch <id> --exit-status`; причина
  падіння — `gh run view <id> --log-failed`.
- Повторний вхід (токен відкликано/протух): `gh auth login --hostname github.com --web --git-protocol ssh
  --skip-ssh-key` у фоні, людині — код і https://github.com/login/device. Код діє **15 хвилин** —
  запускати лише коли людина готова.
- Без `gh` (запасний шлях): посилання `https://github.com/RenJeka/olx-dashboard/compare/main...<гілка>?expand=1`;
  CI — публічний API `https://api.github.com/repos/RenJeka/olx-dashboard/actions/runs?branch=<гілка>&per_page=1`.

## Чого не робити
- Не пробувати GitHub MCP-плагін (`plugin:engineering:github`) через OAuth: «Incompatible auth server:
  does not support dynamic client registration».
- Не виводити токен (`gh auth token`) у чат чи лог.

## Як перевірити
`gh auth status` → `Logged in to github.com account RenJeka`.
