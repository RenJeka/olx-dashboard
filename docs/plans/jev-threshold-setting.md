# Поріг Jev для мінусів/плюсів — у налаштуваннях AI

> **Статус:** 🟢 активний · рішення людини 2026-10-10 («так» на поріг в UI) · код готовий (гілка `feat/criteria-categories`) · test-cases 1–2 виконано (Vitest, браузер агента); 3 — платний прогін людиною, не виконано

## Контекст

- Рушій Jev на кроці 2 повертає ймовірність 0…1 на кожну категорію; категорія «знайдена», якщо ймовірність ≥ порогу.
  Поріг — константа `JEV_CRITERIA_THRESHOLD = 0.7` (`server/src/analysis/constants.ts`), підібрана в експерименті
  2026-10-06 ([jev-model](jev-model.md) → етап 3). Людина хоче задавати його сама.
- Поріг кроку 1 (`JEV_RELEVANCE_THRESHOLD = 0.5`) лишається константою — людина про нього не просила.

## Рішення

- **Де зберігається:** у налаштуваннях браузера (`settingsStore`, localStorage), як і вибір рушія — single-user,
  без зміни схеми БД.
- **Як іде на сервер:** поле `threshold` у тілі `POST /api/searches/:id/analyze` (лише для `engine: 'jev'`).
  Сервер приймає число в межах `JEV_CRITERIA_THRESHOLD_MIN…MAX`, інакше бере `JEV_CRITERIA_THRESHOLD`.
- **UI:** «Налаштування» → AI → поле «Поріг Jev для мінусів/плюсів» (видно, коли рушій — Jev), крок 0.05, кнопка
  «Типово (0.7)». Підказка: вище — менше хибних, але більше пропусків.

## Файли

- Сервер: `analysis/constants.ts` (межі), `analysis/jevEngine.ts` (`resolveCriteriaThreshold`, параметр у
  `runJevMatching`), `routes/analysis/matching.ts`, `jevProbe.ts` (`--threshold`); тест — `jevEngine.test.ts`.
- Фронт: `stores/settingsStore.ts`, `constants.ts` (дефолт і межі — дзеркало), `api/analysis.ts`,
  `hooks/analysis/useAnalysisMatching.ts`, `components/settings/sections/AnalysisSection.tsx`.
- Доки: `jev.md`, `ai-flow.md`, `architecture.md` (тіло `/analyze`).

## Кроки

- [x] 1. Сервер: межі, `resolveCriteriaThreshold`, параметр `runJevMatching`, `threshold` у `/analyze`, `--threshold`
      у `jev:probe` + Vitest.
- [x] 2. Фронт: налаштування, передача в `/analyze`, поле в розділі AI.
- [x] 3. Доки; `npm run check`, `npm run build`; перевірка в браузері.

## Test-cases

1. Vitest: поріг 0.9 → категорія з ймовірністю 0.8 не знайдена; без порогу → 0.7 (як раніше); поріг поза межами або
   не число → 0.7.
2. Вручну: «Налаштування» → AI → рушій Jev → поле порогу видно; змінити на 0.8, перезавантажити сторінку — значення
   лишилось; рушій LLM — поле сховане.
3. Вручну (людина, платно): крок 2 рушієм Jev з порогом 0.5 і 0.9 — у «Перевірці» кількість знайдених відрізняється.
