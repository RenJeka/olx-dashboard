---
name: jev-agent-setup
created: 2026-10-04
source: план jev-model (сесія 2026-10-04)
---
# Jev для агента: MCP і скіли jevai.org

## Коли застосовувати
Треба підключити (або перевірити) Jev як інструмент рішень для Claude Code: tool-guard, model/task-routing,
research-guard, completion-review. Для застосунку (AI-кроки) це **не потрібно** — він ходить у Jev через
OpenRouter ([jev](../jev.md)).

## Що робити
Ставимо **глобально** (рішення людини 2026-10-04): не в репо, тож правило «скіли лише в `skills/`» не зачіпається.

1. **Ключ (робить людина):** увійти на https://www.jevai.org/agent/keys → створити ключ → у PowerShell
   `setx JEV_API_KEY "<ключ>"` → перезапустити wmux/Claude Code. Ключ агенту не показувати
   ([secrets-in-sources](secrets-in-sources.md)).
2. **Скіли:** завантажити `https://www.jevai.org/skills/<назва>/SKILL.md` для `jev`, `jev-task-router`,
   `jev-model-router`, `jev-tool-guard`, `jev-research-guard`, `jev-completion-review`; прочитати; покласти в
   `%USERPROFILE%\.claude\skills\<назва>\SKILL.md`. У джерелі **немає YAML-frontmatter** — дописати
   `name` і `description` (опис «коли викликати» — з https://www.jevai.org/skills), інакше Claude Code
   не знає, коли скіл застосовувати.
3. **MCP (user scope):** у Git Bash —
   `claude mcp add --scope user --transport http jev https://www.jevai.org/api/mcp --header 'Authorization: Bearer ${JEV_API_KEY}'`
   (одинарні лапки — щоб shell не підставив значення і ключ не потрапив у конфіг відкритим текстом).
4. Лише `https://www.` — `http://` і домен без `www` редиректять, і клієнт перетворює POST на GET → `405`.

## Чого не робити
- Не класти ключ у SKILL.md, `.mcp.json`, репо, лог чи вивід інструмента.
- Не вигадувати результат, якщо інструментів `jev_*` не видно, — спершу перевірити підключення MCP.
- Не сприймати вердикт Jev як дозвіл: підтвердження людини для проду (`docs/rules.md` → «Прод») лишаються.

## Як перевірити
- `claude mcp list` → `jev` connected; у сесії видно інструменти `jev_*`.
- Виклик `jev_review_completion` з тестовим `objective` повертає рішення (`complete|verify_more|incomplete`).
- `initialize`/`tools/list` квоту не витрачають, `tools/call` — витрачає.
- У `~/.claude.json` заголовок лишається буквально `Bearer ${JEV_API_KEY}` — це нормально: підстановка
  відбувається під час запуску (перевірено 2026-10-04, `claude mcp get jev` → Connected). Сесія, запущена до
  `setx`, змінної не бачить — потрібен перезапуск.
- `Connected` і `tools/list` ключ не перевіряють. Справжня перевірка — `tools/call`. Невірний ключ → REST `401`;
  `502` / «The request credentials or model access were rejected» при валідному ключі — збій на боці jevai.org
  (спостерігалось 2026-10-04), не наша конфігурація: повторити пізніше.
- 2026-10-05/06 MCP `jev` при старті сесії вже не підключається: `401 Invalid or missing Jev API key`. Ймовірно,
  ключ протух або відкликаний → людина перевипускає ключ (крок 1) і перезапускає wmux/Claude Code.

## Пов'язане
[jev](../jev.md), [plans/jev-model](../plans/jev-model.md), [secrets-in-sources](secrets-in-sources.md).
