# Jev — decision-модель TypeSafe

Довідка: що таке Jev, як його викликати, обмеження й правила формулювання питань. План використання в
AI-кроках — [`plans/jev-model.md`](plans/jev-model.md); у застосунку Jev — рушій кроків 1–2
([`ai-flow.md`](ai-flow.md) → «Рушій Jev»).
Ціни й ліміти — знімок на 2026-10-04; актуальні — на сторінці моделі (див. «Джерела»).

## Що це

Jev (`typesafe/jev-1.13`) — **не LLM**, а «System One» модель рішень: на вхід — `state` (текст або JSON) і
типізовані питання, на вихід — лише ймовірності. Тексту, пояснень, reasoning немає.

| Примітив | Питання | Відповідь |
| --- | --- | --- |
| `noul` | Чи виконується умова? | `noul` — ймовірність «так», 0…1 |
| `choice` | Який із варіантів? | `choice`, `probabilities` по кожному, `confidence` |
| `score` | Де на впорядкованій шкалі? | `score` (зважена позиція), `probabilities`, `legend`, `confidence` |

Кілька питань в одному запиті відповідаються паралельно й незалежно (не бачать відповідей одне одного).

## Дві поверхні — для різних споживачів

| Поверхня | Для кого | Ключ | Endpoint |
| --- | --- | --- | --- |
| **OpenRouter Decisions API** | застосунок (сервер olx-dashboard) | `OPENROUTER_API_KEY` (той самий, що для LLM) | `POST https://openrouter.ai/api/alpha/decisions` |
| **jevai.org MCP + skills** | агент (Claude Code) — tool-guard, model/task-routing, completion-review | особистий `JEV_API_KEY` з https://www.jevai.org/agent/keys, денна квота | `https://www.jevai.org/api/mcp` |

Встановлення MCP і скілів для агента — [instructions/jev-agent-setup](instructions/jev-agent-setup.md).

## Запит і відповідь (OpenRouter)

```json
{
  "model": "typesafe/jev-1.13",
  "state": { "title": "...", "characteristics": "...", "description": "..." },
  "questions": {
    "relevant": { "type": "noul", "instructions": "Is the listing selling <target> itself?",
                  "criteria": { "true": "...", "false": "..." } },
    "condition": { "type": "choice", "instructions": "...", "criteria": { "new": "...", "used": "..." } }
  }
}
```

Відповідь: `answers.<ключ>` за типом + `usage: { input_tokens, output_tokens, cost }` + `model` (датована
версія, напр. `typesafe/jev-1.13-20260917`). Помилки: `429`, `5xx`, `402` з
`error.metadata.limit_source = "openrouter_in_flight_budget"` — тимчасові (retry за `Retry-After`);
інший `402` — скінчились кредити, `400` — помилка запиту (не повторювати).

## Ціна, ліміти, контекст

- **Ціна:** $0.042 за 1M **вхідних** токенів; вихідні — безкоштовно. Точна вартість кожного виклику — `usage.cost`.
- **Що оплачується:** `state` (обробляється один раз) + текст усіх питань. Довгі формулювання питань теж коштують.
- **Контекст:** 32k токенів на `state` + найдовше питання; 64k — `state` + усі питання разом.
- **Rate limits:** токени/с і запити/с; TypeSafe попереджає, що ліміти зараз змінюються динамічно → завжди retry з backoff.
- **Один `state` на запит:** батчити кілька оголошень в один виклик не можна (на відміну від LLM-рушія); масовість —
  паралельними запитами з обмеженою concurrency.
- **Версія:** пінити `typesafe/jev-1.13`; аліас `~typesafe/jev-latest` рухається з релізами (пороги можуть «поїхати»).

## Обмеження («jaggedness» jev-1.13) і як писати питання

- **Мова:** основна — англійська; українська/російська працюють, але з нижчою точністю → пороги підбирати
  на власних даних, питання писати англійською (опис лишається як є).
- **Буквальне читання:** у `instructions` — точна умова; межові випадки — у `criteria`; `criteria` не має
  суперечити `instructions` (`true` = «так»). Дієслово «state» Jev читає як «написано дослівно» й занижує
  ймовірність перефразованого; для мінусів/плюсів межа «stated or clearly implied» підняла повноту без втрати
  точності (експеримент 2026-10-06, план [jev-model](plans/jev-model.md) → етап 3).
- **Зайвий текст у `state` знижує точність** («context rot»): фільтрувати в коді, слати лише потрібні поля.
- **Не рахує, не порівнює числа й дати, не генерує текст** — це робить код (або LLM).
- **Одне судження — одне питання;** складне розбити на кілька `noul` і скомбінувати в коді.
- **Порядок варіантів у `choice` впливає** (тяжіє до першого) — перевіряти перестановкою.
- **`state` — дані, не інструкції,** але ворожий текст в описі може зсунути відповідь.
- **Пороги** — з розміченої вибірки (precision/recall по кожному `noul`), не «0.5 за замовчуванням».
- **Синоніми цілі в питанні не обрізати:** Jev не знає, що «книжкова полиця» — теж ціль, якщо її немає в
  питанні; обрізання списку синонімів дешевшає на копійки, а справжні лоти випадають (пілот 2026-10-05).
- **PII продавця** в `state` не слати (той самий інваріант, що для LLM — `AGENTS.md` → «AI»).

## Джерела

- OpenRouter: [Jev hub](https://openrouter.ai/docs/guides/community/jev),
  [tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial),
  [classify at scale](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/jev-classification),
  [Decisions API reference](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request),
  [сторінка моделі (ціна)](https://openrouter.ai/typesafe/jev-1.13).
- TypeSafe: [state](https://docs.typesafe.ai/concepts/state), [models](https://docs.typesafe.ai/models),
  [jaggedness jev-1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13),
  [confidence](https://docs.typesafe.ai/confidence), [primitives](https://docs.typesafe.ai/primitives/advanced).
- jevai.org: [docs](https://www.jevai.org/docs), [agent](https://www.jevai.org/agent),
  [mcp](https://www.jevai.org/mcp), [skills](https://www.jevai.org/skills).
