# CLAUDE.md — olx-monitor

Персональна система моніторингу оголошень OLX.ua: збір → SQLite → React-таблиця зі статусами/нотатками/історією цін, експорт у Notion. Single-user, локальний запуск.

## Стек (не відхилятися без явного запиту)

- **Monorepo:** npm workspaces — `server/` + `web/`.
- **Backend:** Node.js 20+, TypeScript, **Fastify**, **better-sqlite3** (синхронний), **cheerio** (парсинг), **node-cron** (опц.).
- **Frontend:** React 18 + **Vite** + **TanStack Table v8** + **TanStack Query v5** + **Chakra UI v3** (`@chakra-ui/react`, провайдер/тостер/тултіп — сніпети у `web/src/components/ui/`).
- **State management:** **Zustand** (узгоджена залежність `web/`, in-memory без persist) — для клієнтського UI-стану, який пересікає кілька компонентів без prop drilling. Стори: `web/src/stores/listingsUiStore.ts` (вкладка фільтра статусів), `web/src/stores/analysisWizardStore.ts` (прогрес AI-Flow).
- **Іконки:** `react-icons/lu` (набір Lucide) — стандартний вибір для Chakra UI v3.
- **Notion:** `@notionhq/client`.
- **LLM-аналіз:** OpenRouter через звичайний `fetch` (без SDK); Excel-експорт — **`exceljs`**
  (узгоджена нова залежність `server/`, обрано замість `xlsx`/SheetJS: той має
  невиправлені high-severity CVE й перейшов на платну модель). ZIP-пакет ручного режиму
  (промпт + чанки описів) — **`archiver`** (+ `@types/archiver`), друга узгоджена нова
  залежність `server/`: у Node немає вбудованого ZIP-writer. `.env` — через
  `process.loadEnvFile` (міні-лоадер у `server/src/analysis/config.ts`), без нової залежності.
- НЕ використовувати: Express, Prisma/ORM, PostgreSQL, Redux, Playwright у MVP.

## Метод збору даних (КРИТИЧНО — підтверджено живими запитами 2026-06-10)

- **Основний: GraphQL** — `POST https://www.olx.ua/apigateway/graphql`, query `ListingSearchQuery` → `clientCompatibleListings(searchParameters)`. Працює **без кукі, без auth, без токенів**. Дає ціну числом, ISO-дати, `params`, `business`. Усі деталі (заголовки, body, ключі `searchParameters`, приклади, маппінг полів у БД) — у `docs/olx-api.md` §2; реалізація — `server/src/scraper/graphqlOlxFetcher.ts`.
- Range-фільтри GraphQL: `searchParameters` елемент `{key: "filter_float_<name>:from|:to", value: "<число-рядком>"}` (верифіковано для `price`).
- **Fallback №1: HTML** — `fetch` на URL пошуку `https://www.olx.ua/d/uk/list/q-<slug>/?...` → парсинг server-rendered HTML через cheerio (`server/src/scraper/olxFetcher.ts`). Scanner вмикає його автоматично при падінні GraphQL. БЕЗ браузера/Playwright. Деталі URL/заголовків — `docs/olx-api.md` §3.
- Селектори HTML-fallback (тримати в одному файлі `server/src/scraper/selectors.ts`):
  - картка `[data-cy="l-card"]`, назва `h6, h4` (OLX мігрував заголовок з `h6` на `h4` — тримати обидва), ціна `[data-testid="ad-price"]`, лінк `a[href]` (відносний → префікс `https://www.olx.ua`), дата/локація `[data-testid="location-date"]`, порожньо `[data-cy="empty-state"]`.
  - detail: характеристики `[data-cy="ad-params"] li`, опис `[data-testid="ad_description"]`, продавець `[data-testid="user-profile-user-name"]` (бізнес — fallback `[data-testid="trader-title"]`).
- Ввічливість (обидва методи, **звичайний скан**): 1–2 с затримка між запитами/сторінками, **≤3 запити** на скан.
- **Глибокий скан** (ручна кнопка «Глибокий скан» в UI поруч зі «Сканувати», або CLI `--deep`) —
  одноразовий поглиблений прохід для нарощування покриття БД: батчі по 3 запити (як звичайний
  скан), пауза **3–6 с** між батчами, ціль `min(26, ceil(visible_total_count / 40))` запитів
  (`26` = `MAX_PAGES` — межа вікна пагінації GraphQL OLX, `offset ≤ 1000`, верифіковано
  2026-06-12; `50` лишається стартовою оцінкою `DEEP_SAFETY_CAP` до 1-го запиту, але кап
  завжди `26`). Рання зупинка, якщо сторінка повернула `< 40`/порожньо — як і в звичайному
  скані. Якщо GraphQL впирається у вікно пагінації посеред скану (`ListingError` на
  `offset > 0` з уже зібраними даними) — скан завершується частковим успіхом
  (`exhausted=false`, `warning` у `scan_runs.error`), HTML-fallback не запускається.
  Прогрес (`requests_done`/`requests_total` у `scan_runs`) пишеться через
  `FetchOptions.onProgress` і віддається `GET /api/searches/:id/scan-status` для
  поллінгу фронтендом. Деталі — `docs/olx-api.md` §2.9.
- Усі стратегії — за інтерфейсом `OlxFetcher` (`server/src/types.ts`, `fetchSearch(search, options?: FetchOptions)`);
  подальші fallback (`__NEXT_DATA__` → headed Playwright) — лише за рішенням людини.
- REST `api/v1/offers/` існує (дзеркало GraphQL, видно в `links` відповіді) — використовуємо GraphQL-варіант.
- Dataflow фронтенду OLX (знято live 2026-06-11, деталі — `docs/olx-api.md` §2.10): перше завантаження сторінки пошуку — SSR (оголошення вже в HTML/`__NEXT_DATA__`, GraphQL НЕ викликається); GraphQL спрацьовує лише при клієнтських діях (фільтр/сортування/пагінація). «Підготовчих» запитів GraphQL не потребує — супутні `friendly-links`/`offers/metadata` це косметика UI сайту.

## Схема БД

Канонічна схема — у `server/src/db/schema.sql`. Таблиці: `searches`, `listings`, `price_history`, `scan_runs`. Не дублювати визначення в коді — читати/застосовувати з SQL-файлу при старті.

Ключові інваріанти:
- `listings.olx_id` UNIQUE — ключ дедуплікації (upsert по ньому).
- `status` ∈ `new|interested|contacted|rejected|disabled` (CHECK у схемі); `rejected` — лише ручний статус («не цікаво»).
- `status_source` ∈ `auto|manual`.
- `miss_count` — лічильник послідовних сканів без цього оголошення у вікні покриття (механіка — нижче).
- `params` — сирий JSON (характеристики різняться між категоріями; колонки UI динамічні).

## Бізнес-логіка (інваріанти, не порушувати)

- **Upsert:** новий `olx_id` → insert (`status='new'`, окрім миттєвого `olx_status`-disable нижче). Існуючий → update полів + `last_seen_at`; якщо ціна змінилась — рядок у `price_history`.
- **Auto-disable — вікно покриття (coverage window):** працює на осі **`last_refresh_at`** (дата підняття; НЕ `posted_at` — «підняті» старі оголошення йдуть угорі видачі й розтягнули б вікно на роки: інцидент 2026-06-12, 395 хибних disable, `docs/plans/coverage-window-fix.md`). Усі GraphQL-запити збору передають `sort_by=created_at:desc` (фактичний порядок видачі — `last_refresh_time DESC`, промо поза порядком; `docs/olx-api.md` §2.5). Після **повного** успішного **GraphQL**-скану (HTML-fallback і часткові скани з warning — напр. «window cap hit» — цю логіку НЕ запускають) — `windowFloor = lastRefreshAt` ОСТАННЬОГО отриманого оголошення (низ останньої сторінки; не `min()` — промо розтягнули б вікно), або `NULL`, якщо видача вичерпана (`exhausted`) — тоді вікно = вся видача; немає осі (порожня видача) → прохід пропускається. Кандидати на `miss_count += 1` — рядки цього `search_id` зі `status != 'disabled'`, відсутні в цьому скані, з `last_refresh_at >= windowFloor` (рядки з `last_refresh_at IS NULL` — «хвіст»/старі — не кандидати ніколи, їх перевіряє verify); присутнім — `miss_count = 0`. При `miss_count >= 2` і (`status_source='auto'` АБО `status='rejected'`) → `status='disabled'` + позначка `auto-disabled: coverage miss_count=2` у `note` (кожен auto-disable має пояснення причини в нотатці). Реалізація — `server/src/scraper/statusEngine.ts`, викликається з `scanner.ts`.
- **`olx_status` миттєвий auto-disable:** якщо GraphQL повернув `olx_status ≠ 'active'` для рядка зі `status_source='auto'` АБО `status='rejected'` → миттєво `status='disabled'`, у `note` додається позначка `auto-disabled: olx_status=<значення>` (маркер для ручної перевірки тепер задокументований у `docs/olx-api.md` §3.4 — такі рядки потрапляють у verify-прохід і підтверджуються/спростовуються прямою пробою сторінки).
- **Verify-прохід (реалізовано, A3):** ручний прохід (кнопка «Перевірити неактивні» / CLI `--verify`) по кандидатах ≤50 сторінок за прохід — P1 (давно не бачені: `last_seen_at` старше 3 днів і (`status_source='auto'` АБО `status='rejected'`), включно з `status='disabled'` для реактивації, `ORDER BY last_seen_at ASC`) + P2 (рядки без `description`, ще не в P1, `ORDER BY posted_at DESC`); той самий батч-патерн, що й глибокий скан. Маркер неактивності (верифіковано live 2026-06-12, `docs/olx-api.md` §3.4): HTTP `410`/`404` → `dead` (auto/rejected → `disabled`, позначка `auto-disabled: verify http=<код>` у `note`); `200` + `[data-testid="ad_description"]` → `alive` (оновлює `last_seen_at`/`miss_count=0`, auto-reactivate `disabled→new`, дозаповнює `description`/`seller_name` лише якщо в БД `NULL`); інше → `unknown` (без змін). Реалізація — `server/src/scraper/verifier.ts` (`probeListingPage`) + `runVerify` у `server/src/scanner.ts`.
- **Ручний override:** будь-яка ручна зміна статусу (`PATCH /api/listings/:id`) → `status_source='manual'`, `miss_count=0`. Якщо `status_source='manual'` — auto-логіка (вікно покриття, `olx_status`, verify) НЕ перетирає статус, окрім переходу `rejected → disabled` (зникнення з OLX — факт сильніший за ручну оцінку).
- **Auto-reactivate:** auto-disabled оголошення знову з'явилося в GraphQL-видачі з `olx_status='active'` (або verify підтвердив живе) → назад у `new`, `miss_count=0`. Manual-disabled НЕ реактивується автоматично.
- **filtered_out:** `local_filters` (стоп-слова у title+description, числові діапазони по `params`) ставлять прапорець, НЕ видаляють рядок. Зміна `local_filters` (`PATCH /api/searches/:id`) → синхронний ретроактивний перерахунок `filtered_out` для всіх рядків пошуку.
- **Notion-синк:** one-way (app → Notion), match по `olx_id`. Двосторонній — поза скоупом.
- **LLM-аналіз (мінуси/плюси, план `docs/plans/llm-analysis.md`):** аналіз описів через
  4-етапний майстер (кнопка «AI» у хедері). **Ніколи не авто** — лише вручну за тригером
  (жодного зі сканів/автооновлення/cron). Два рівноправні рушії: **авто** (OpenRouter,
  `google/gemini-2.5-flash-lite` дефолт) і **повний ручний** (копіювання промпту → будь-який
  безкоштовний чат → вставка відповіді → сервер парсить); ключ повністю опціональний.
  Інваріанти:
  - **Критерії — на рівні пошуку** (`searches.analysis_criteria`, JSON `{cons:[], pros:[]}`).
    **Мінуси/плюси — на рівні оголошення** (`listings.cons`/`pros`, TEXT `• criterion\n• …`,
    сумісно з ручним едітом `ProsConsCell`).
  - **`evidence` (дослівний фрагмент) у БД НЕ зберігається.** LLM повертає `{criterion,
    evidence}`; сервер верифікує `evidence` як підрядок опису (анти-галюцинація); у БД пише
    лише масив `criterion`.
  - **PII продавця в промпт не йде** (тільки `id/title/description/params`).
  - Ключ OpenRouter — лише в `server/.env` (`OPENROUTER_API_KEY`), ніколи в код/git.
  - Промпти — єдине джерело `server/src/analysis/prompts.ts` (спільне для авто й ручного).
  - Зміна `title`/`description` після аналізу → `analysis_stale=1` (бейдж «застарілий
    аналіз»), без авто-переаналізу. Перезапис непорожніх `pros`/`cons` — діалог підтвердження.
  - Чанкування: авто — дрібні батчі (12), ручний ZIP-пакет — фіксовано 50 оголошень на файл
    `descriptions/chunk-NNN.json`. Реалізація — `server/src/analysis/*`,
    `server/src/routes/analysis.ts`, `server/src/export/xlsx.ts`, фронт —
    `web/src/components/analysis/*`.

## Команди

```bash
npm run dev          # server (Fastify, :3001) + web (Vite, :5173) паралельно
npm run dev:server
npm run dev:web
npm run build
npm run scan -- --search <id>   # CLI-скан без UI (для крону/дебагу)
```

## Конвенції

- TypeScript strict. Без `any` у доменних типах (scraper/db/logic).
- Доменні типи — `server/src/types.ts`, типи фронтенду — `web/src/types/index.ts`. Шарити між беком і фронтом через дублювання DTO (без складних build-зчеплень).
- Помилки скрейпінгу не валять процес: лог у `scan_runs.error`, скан позначається failed, попередні дані лишаються.
- Секрети (`NOTION_TOKEN`, `NOTION_PARENT_PAGE_ID`) — лише в `.env`, ніколи в код/git. `server/data/*.db` — gitignored.
- Коментарі та UI-текст — українською; код/ідентифікатори — англійською.
- Після реалізації змін пропонувати текст git commit повідомлення ангійською мовою (тільки текст).

## Документація

- `docs/architecture.md` — технічна архітектура, потік даних, модулі, стан API.
- `docs/olx-api.md` — деталі запитів до OLX (URL/параметри/заголовки/селектори/fallback); оновлювати при будь-якій зміні розмітки чи параметрів OLX.
- `docs/structure.md` — дерево файлів/папок і орієнтири «куди дивитись».
- `docs/ai-flow.md` — короткий огляд AI-аналізу мінусів/плюсів (майстер, авто/ручний рушії, append/replace).
- `docs/olx-monitor-spec.md` — канонічна специфікація (вимоги, схема БД §5, етапи, ризики).
- `docs/plans/initial-mvp.md` — план Етапу 1 із прогресом.
- `docs/plans/graphql-migration.md` — план міграції збору на GraphQL (інструкція для виконавця).
- `docs/plans/stage-2-statuses-and-filters.md` — план Етапу 2 (статуси/нотатки/локальні фільтри/панель дій) із прогресом.
- `docs/plans/llm-analysis.md` — план LLM-аналізу (майстер «Плюси/Мінуси», OpenRouter + ручний режим) із прогресом.
- Плани нових фіч/задач — завжди створювати/оновлювати в `docs/plans/<назва>.md` за форматом наявних файлів (контекст → файли → кроки з чекбоксами → test-cases). Створювати файл плану ПЕРШИМ кроком, до початку правок коду.
- Після зміни коду, що додає файли/пакети/скрипти/ендпойнти — оновлювати `docs/architecture.md` і `docs/structure.md`.

## Етапи (рухатись по черзі, не забігати вперед)

1. ✅ **MVP (зроблено):** OlxFetcher (HTML+cheerio) + schema + upsert + `POST /searches/:id/scan` + React-таблиця. Спільна логіка скану — `server/src/scanner.ts` (роут + CLI). Доповнення: міграція збору на GraphQL (`GraphqlOlxFetcher` основний, HTML — fallback) — див. `docs/plans/graphql-migration.md`; міграція UI на Chakra UI v3 + Drawer налаштувань (тема, видимість колонок) + колонки «Опис»/«Продавець»/«Статус OLX» і лічильник «Результатів: N».
2. ✅ **Статуси (ручні + auto-disable) + нотатки + інлайн-едіт + локальні range-фільтри + verify-прохід:**
   реалізовано (`docs/plans/stage-2-statuses-and-filters.md`, `docs/plans/verify-pass.md`):
   статуси/нотатки/bulk-дії, вікно покриття, `olx_status`-disable, локальні фільтри, панель
   дій пошуку, автооновлення, verify-прохід (A3) для давно не бачених оголошень і
   дозаповнення опису/продавця.
3. price_history + спарклайни + MD-експорт для аналізу в Claude.
4. Notion-експорт + node-cron + журнал scan_runs.

> Поза чергою (за окремим запитом): ✅ **LLM-аналіз мінусів/плюсів** — майстер «AI» (OpenRouter
> + повний ручний режим), `docs/plans/llm-analysis.md`. Критерії на рівні пошуку, мінуси/плюси
> на рівні оголошення; ніколи не авто.

## Що питати перед дією

- Якщо GraphQL почав падати — діагностика за чеклістом `docs/olx-api.md` §5 (HTML-fallback вмикається автоматично); НЕ переходити одразу на Playwright; спершу перевірити `__NEXT_DATA__` і показати мені зразок HTML.
- Зміни стеку/схеми/інваріантів вище — лише після підтвердження.
