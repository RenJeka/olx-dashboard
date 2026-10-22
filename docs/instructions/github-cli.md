---
name: github-cli
created: 2026-10-01
source: хендоф 2026-09-30-stability-harness-access; сесія 2026-10-01 (встановлення `gh`)
---
# GitHub: PR і CI через `gh`

## Коли застосовувати
Треба відкрити PR, подивитись CI чи логи впалого прогону.

## Що робити
- `gh` встановлено на домашньому й робочому ПК (`winget install GitHub.cli`), вхід — акаунт `RenJeka`. Якщо `gh`
  не знаходиться в PATH (сесія, відкрита до встановлення) — повний шлях `C:\Program Files\GitHub CLI\gh.exe`
  (Git Bash: `"/c/Program Files/GitHub CLI/gh.exe"`). Перевірка: `gh auth status`.
- PR: `gh pr create --base main --head <гілка> --title "…" --body-file -` (вимоги до тексту —
  [`docs/rules.md`](../rules.md) → «Git»). Перед створенням — зелений CI гілки.
- CI: `gh run list --branch <гілка> --limit 1`; дочекатись — `gh run watch <id> --exit-status`; причина
  падіння — `gh run view <id> --log-failed`. Не `gh pr checks <N> --watch`: він чекає ще й рев'ю CodeRabbit (теж
  check PR) і за 5 хв таймауту Bash не завершився (2026-10-13), хоча CI був зелений за хвилину.
- Повторний вхід (токен відкликано/протух): `gh auth login --hostname github.com --web --git-protocol ssh
  --skip-ssh-key` у фоні, людині — код і https://github.com/login/device. Код діє **15 хвилин** —
  запускати лише коли людина готова. Людина без доступу до ПК (керує через Remote Control) вводить код з телефона —
  сторінка працює в будь-якому браузері з входом у GitHub.
- Без `gh` (запасний шлях): посилання `https://github.com/RenJeka/olx-dashboard/compare/main...<гілка>?expand=1`;
  CI — публічний API `https://api.github.com/repos/RenJeka/olx-dashboard/actions/runs?branch=<гілка>&per_page=1`.

- Закрити чужий/зайвий PR (`gh pr close`) auto-mode агента блокує як запис у зовнішню систему — дати людині
  команду `! gh pr close <N> --comment "…"` (префікс `!` запускає її в сесії).
- Злити PR у `main` (`gh pr merge`) auto-mode блокує як «Production Deploy» навіть після «так» людини в діалозі —
  дати людині `! gh pr merge <N> --merge` (або кнопку «Create a merge commit» на сторінці PR); далі агент сам
  підтягує `main`, перевіряє деплой Render і запускає `npm run smoke`.

## Чого не робити
- Не пробувати GitHub MCP-плагін (`plugin:engineering:github`) через OAuth: «Incompatible auth server:
  does not support dynamic client registration».
- Не виводити токен (`gh auth token`) у чат чи лог.

## Як перевірити
`gh auth status` → `Logged in to github.com account RenJeka`.
