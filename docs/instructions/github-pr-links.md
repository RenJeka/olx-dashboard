---
name: github-pr-links
created: 2026-10-01
source: хендоф 2026-09-30-stability-harness-access
---
# PR без `gh`: посилання compare

## Коли застосовувати
Треба відкрити PR, а GitHub CLI (`gh`) не встановлено.

## Що робити
- Запушити гілку й дати людині клікабельне посилання
  `https://github.com/RenJeka/olx-dashboard/compare/main...<гілка>?expand=1` з готовими назвою й описом
  PR (вимоги до тексту PR — [`docs/rules.md`](../rules.md) → «Git»).
- Стан CI читати публічним API без токена:
  `https://api.github.com/repos/RenJeka/olx-dashboard/actions/runs?branch=<гілка>&per_page=1`.
- Для автоматизації PR — запропонувати `winget install GitHub.cli` → `gh auth login` (рішення людини).

## Чого не робити
- Не пробувати GitHub MCP-плагін (`plugin:engineering:github`) через OAuth: «Incompatible auth server:
  does not support dynamic client registration».

## Як перевірити
Людина відкриває посилання й бачить форму PR із потрібною гілкою.

## Пов'язане
[`docs/rules.md`](../rules.md) → «Git».
