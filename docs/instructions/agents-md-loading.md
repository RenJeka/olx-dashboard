---
name: agents-md-loading
created: 2026-10-01
source: перенесено з харнесу youtrack; документація Claude Code (code.claude.com/docs/en/memory)
---
# Як агенти підхоплюють AGENTS.md і що це вимикає

## Коли застосовувати
Налаштовуєш харнес або здається, що агент не бачить правил репозиторію (`AGENTS.md`, `docs/rules.md`).

## Що робити
- У корені — лише `AGENTS.md`. Claude Code читає його, якщо немає жодного `CLAUDE.md` чи
  `CLAUDE.local.md` у робочій теці або вище. Antigravity читає `AGENTS.md` теж.
- Рядок `@docs/rules.md` в `AGENTS.md` Claude Code розгортає як імпорт. Інші інструменти бачать
  його як текст — тому поруч є явна вказівка прочитати файл.
- Звідки інструменти беруть скіли — [`skills/README.md`](../../skills/README.md).

## Чого не робити
- Не створювати `CLAUDE.md` / `CLAUDE.local.md` у репо: навіть один такий файл вище за теку
  (напр. у `C:\GIT`) непомітно замінює `AGENTS.md`.
- Не класти інструкції в `AGENTS.local.md`, `AGENTS.override.md` — Claude Code їх не читає.

## Як перевірити
- На старті інтерактивної сесії Claude Code — рядок на кшталт `AGENTS.md loaded: <шлях>`.
- Якщо правил не видно: пошукати `CLAUDE.md` у теці й вище; перевірити версію Claude Code; у сесіях
  без телеметрії чи на Bedrock `AGENTS.md` не читається — тоді потрібен `CLAUDE.md` з єдиним рядком
  `@AGENTS.md` (лише за рішенням людини).
- Налаштування «Project instructions»: за замовчуванням `claude-md-or-agents-md`.

## Пов'язане
[`docs/rules.md`](../rules.md) → «Сесії»; [документація Claude Code: пам'ять](https://code.claude.com/docs/en/memory).
