# План: єдиний селектор «Обсяг» для всіх етапів AI

## Контекст

Вибір «Обсяг» в AI-фільтрі релевантності та майстрі «Плюси/Мінуси» реалізовано окремо й
непослідовно: кнопки з'являються/зникають залежно від контексту, логіка дублюється у двох
утилітах із різною семантикою «таб»-обсягу, а «AI Picks» взагалі не має вибору обсягу. Мета —
один спільний, завжди видимий селектор з однаковою поведінкою на всіх трьох етапах AI.

Рішення (підтверджено користувачем):
1. 4 обсяги-перемикачі, завжди видимі (неактивні — `disabled`, не зникають).
2. **«Весь пошук» = геть усі рядки пошуку** (включно з відфільтрованими/нерелевантними).
   Змінює попередній інваріант, де «Весь пошук» виключав нерелевантні/відфільтровані.
3. 4-й перемикач **«Найкращі кандидати»** (`isAiPickCandidate`) — окремий колір (amber) + зірка;
   дефолт лише в «AI Picks». Решта обсягів в «AI Picks» теж працюють (зміни на сервері).
4. Підпис «таб»: `У таблиці · N (Вкладка "<назва>")`.

## Файли

### Нові (спільний шар)
- `web/src/utils/aiScope.ts` — `AiScope`, `ScopeContext`, `getScopeIds`, `getScopeCounts`,
  `getDefaultScope`, `tabName`, `buildScopeLabel`. Перевикористовує `isListingVisible`/
  `isAiPickCandidate` з `utils/listingVisibility.ts`.
- `web/src/hooks/analysis/useAiScope.ts` — спільний хук (listings + counts + effectiveIds),
  читає `statusFilter/showFilteredOut/showIrrelevant` з `listingsUiStore`.
- `web/src/components/analysis/ScopeSelector.tsx` — спільний UI (4 перемикачі).

### Підключення (клієнт)
- Релевантність: `utils/relevance.ts`, `hooks/useRelevanceFlow.ts`,
  `components/analysis/relevance/RelevanceSetupForm.tsx`.
- Майстер: `stores/analysisWizardStore.ts`, `utils/analysis.ts`, `hooks/analysis/useAnalysisScope.ts`,
  `components/analysis/wizard/CriteriaStep.tsx`.
- AI Picks: `components/analysis/hub/AiToolsHub.tsx`, `components/analysis/ai-picks/AiPicksDialog.tsx`,
  `hooks/useAiPicksFlow.ts`, `components/analysis/ai-picks/AiPicksIdleStep.tsx`, `api/aiPicks.ts`.

### Сервер (AI Picks приймає `ids`)
- `server/src/analysis/repo.ts` — `loadPickCandidates(id, ids?)`.
- `server/src/routes/aiPicks.ts` — `ids` у prompt/package/rank/import; prompt+package GET→POST.

## Кроки

- [x] `aiScope.ts` (тип, getScopeIds/Counts, getDefaultScope, tabName, buildScopeLabel)
- [x] `useAiScope.ts`
- [x] `ScopeSelector.tsx`
- [x] Релевантність: util + flow + форма на `<ScopeSelector>`
- [x] Майстер: store-тип + analysis.ts label + useAnalysisScope + CriteriaStep на `<ScopeSelector>`
- [x] AI Picks клієнт: проброс `selectedIds`, scope-стан (дефолт `candidates`), `<ScopeSelector>`
- [x] AI Picks API-клієнт: `ids` + prompt/package GET→POST
- [x] Сервер: `loadPickCandidates(id, ids?)` + 4 ендпойнти
- [x] Документація: CLAUDE.md (інваріант), architecture.md, structure.md, ai-flow.md
- [x] `npm run build` без помилок

## Test-cases

1. Консистентність вигляду на всіх 3 етапах; кнопки не зникають при зміні вкладки/виділення.
2. «Вибрані» `disabled (0)` без виділення; активна з лічильником після виділення.
3. «Весь пошук» лічильник НЕ реагує на перемикачі «Показати відфільтровані/нерелевантні»;
   «У таблиці» — реагує.
4. Дефолти: статус-вкладка → «таб»; «Всі» без виділення → «Весь пошук»; AI Picks → «Найкращі кандидати».
5. AI Picks: «Весь пошук» → промпт/ZIP/rank беруть цей пул; «Найкращі кандидати» = регресія (як було).
6. `npm run build` — без TS-помилок.
