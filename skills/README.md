# Скіли проєкту — єдине джерело

Тут лежать **повні** скіли (`<name>/SKILL.md` + допоміжні файли на кшталт `references/`).
Інструменти бачать їх через **тонкі обгортки**, які генерує `scripts/sync-skills.mjs`:

| Інструмент | Тека обгорток |
|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md` |
| Antigravity | `.agents/skills/<name>/SKILL.md` |

Обгортка містить лише frontmatter (`name`, `description`, `license`), за яким інструмент
знаходить скіл, і вказівку прочитати `skills/<name>/SKILL.md`. Обгортки **не редагувати вручну**.

## Як змінити / додати скіл

1. Правити або створювати `skills/<name>/SKILL.md` (поле `name` у frontmatter = назва теки).
2. Новий скіл — додати в `skills/skills.json` з цілями (`claude`, `agents`).
3. `npm run skills:sync` → закомітити і джерело, і обгортки.
4. `npm run check` (включає `skills:check` і `docs:check`) має бути зеленим.

## Нюанси

- **`simplify` — лише для Antigravity:** у Claude Code є вбудований скіл `/simplify`, проєктна
  обгортка з тією самою назвою його перекрила б.
- **`chakra-ui-builder` встановлено з GitHub** (`skills-lock.json`, CLI `skills`). Команди цього
  CLI (`add`/`update`) пишуть **повну копію** в `.agents/skills/` — після оновлення перенести
  вміст у `skills/chakra-ui-builder/` і запустити `npm run skills:sync` (`skills:check` покаже
  «зайва тека, не згенерована», якщо копія лишилась).
- Перевірено 2026-09-29: Claude Code (`claude -p`) через обгортку доходить до канонічного
  `SKILL.md` і до `references/`.
