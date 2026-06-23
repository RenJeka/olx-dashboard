-- Канонічна схема БД OLX Dashboard (див. docs/olx-monitor-spec.md §5).
-- Застосовується при старті через db.ts (CREATE TABLE IF NOT EXISTS).
-- НЕ дублювати визначення таблиць у коді — джерело істини тут.

-- Проекти — групування пошуків в акордеони (docs/plans/projects.md).
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER,                -- ручний порядок (менше — вище); NULL до бекфілу
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                -- "MacBook Air M1/M2 Київ"
  query TEXT NOT NULL,
  category_id INTEGER,
  api_filters TEXT DEFAULT '{}',     -- JSON: серверні фільтри OLX
  local_filters TEXT DEFAULT '{}',   -- JSON: range-правила + стоп-слова
  cron_enabled INTEGER DEFAULT 0,
  visible_total_count INTEGER,       -- metadata.visible_total_count з останнього успішного скану (GraphQL)
  sort_order INTEGER,                -- ручний порядок у списку (менше — вище); NULL до бекфілу в db.ts
  analysis_criteria TEXT DEFAULT '{}', -- JSON {cons:[], pros:[]}: обрані критерії LLM-аналізу (рівень пошуку)
  relevance_target TEXT DEFAULT '', -- семантичний фільтр: опис цільового товару (порожньо → query)
  query_synonyms TEXT DEFAULT '[]', -- JSON-масив альтернативних пошукових запитів (синоніми query)
  category_facet TEXT,               -- JSON CategoryOption[] (дерево категорій OLX: id+назва+ієрархія+OLX-лічильник) з останнього скану; docs/plans/category-counts-and-filter.md
  archived INTEGER DEFAULT 0,        -- 1 — пошук в архіві (прихований зі списку активних)
  project_id INTEGER REFERENCES projects(id), -- проект, до якого віднесено пошук (NULL — «Без проекту»)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  olx_id INTEGER NOT NULL UNIQUE,    -- ключ дедуплікації (upsert по ньому)
  search_id INTEGER REFERENCES searches(id),
  title TEXT,
  url TEXT,
  price REAL,
  currency TEXT DEFAULT 'UAH',
  city TEXT,
  district TEXT,
  params TEXT DEFAULT '{}',          -- JSON: всі характеристики з OLX
  category_id INTEGER,               -- OLX category.id (числовий id листової категорії); словник назв — olxCategories.ts
  category_type TEXT,                -- OLX category.type (слаг верхнього рівня, напр. "electronics")
  photo_url TEXT,
  photo_urls TEXT,                   -- JSON-масив прев'ю-лінків усіх фото (галерея), NULL до re-scan
  seller_type TEXT,                  -- private | business
  description TEXT,                  -- HTML-опис з OLX (з <br /> тегами)
  seller_name TEXT,                  -- user.name з GraphQL
  contact_name TEXT,                 -- contact.name з GraphQL
  olx_status TEXT,                   -- статус оголошення на OLX (напр. "active"); НЕ плутати з полем status нижче
  posted_at TEXT,
  last_refresh_at TEXT,              -- ISO-дата останнього підняття (GraphQL last_refresh_time); вісь вікна покриття statusEngine

  status TEXT DEFAULT 'new'
    CHECK (status IN ('new','interested','contacted','rejected','disabled')),
  status_source TEXT DEFAULT 'auto', -- auto | manual
  note TEXT DEFAULT '',
  pros TEXT DEFAULT '',   -- LLM-аналіз: знайдені плюси (масив criterion, формат "• criterion\n• ...")
  cons TEXT DEFAULT '',   -- LLM-аналіз: знайдені мінуси (масив criterion, формат "• criterion\n• ...")
  analysis_at TEXT,                  -- ISO-час останнього LLM-аналізу (NULL — не аналізувалось)
  analysis_source TEXT,              -- джерело аналізу: api (OpenRouter) | import (ручна вставка)
  analysis_model TEXT,               -- модель аналізу (api) або 'manual' (import)
  analysis_stale INTEGER DEFAULT 0,  -- 1 — title/description змінились після аналізу (бейдж «застарілий аналіз»)
  filtered_out INTEGER DEFAULT 0,
  miss_count INTEGER DEFAULT 0,      -- скани поспіль без цього оголошення у вікні покриття (Етап 2)
  ai_rank INTEGER,                   -- AI Вибір: ранг серед найкращих (NULL = не обрано)
  ai_pick_reason TEXT,               -- AI Вибір: пояснення чому оголошення обрано
  ai_ranked_at TEXT,                 -- AI Вибір: час останнього AI-ранжування
  ai_relevant INTEGER,               -- Семантичний фільтр: NULL=не перевірено, 1=продає товар, 0=нерелевантне
  ai_relevant_reason TEXT,           -- Семантичний фільтр: коротке пояснення вердикту AI
  ai_relevant_at TEXT,               -- Семантичний фільтр: час останньої класифікації
  ai_relevant_source TEXT,           -- Семантичний фільтр: api | import | manual (ручний override)
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_listings_search_status ON listings(search_id, status);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER REFERENCES listings(id),
  price REAL NOT NULL,
  observed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY,
  search_id INTEGER REFERENCES searches(id),
  kind TEXT DEFAULT 'normal',        -- normal | deep | verify | analyze (двофазний deep-скан)
  started_at TEXT,
  finished_at TEXT,
  found INTEGER,                     -- унікальних оголошень (після дедупу по olx_id)
  new_count INTEGER,
  raw_found INTEGER,                 -- сирих оголошень до дедупу між синонімами (raw_found - found = злито дублів)
  disabled_count INTEGER,
  scan_plan TEXT,                    -- JSON ScanPlan для kind='analyze' (історія аналізу, перегляд останнього)
  error TEXT,                        -- ТІЛЬКИ реальний збій скану (обидві стратегії впали)
  warning TEXT,                      -- частковий успіх (multi-query/split/HTML-fallback): скан вдався, але з застереженням; НЕ помилка
  requests_done INTEGER DEFAULT 0,   -- прогрес глибокого скану: виконано запитів
  requests_total INTEGER,            -- прогрес глибокого скану: ціль (NULL поки невідома)
  fetch_method TEXT,                 -- GraphQL | HTML
  stage TEXT,                        -- людиномовний поточний етап (транзієнтний текст, docs/plans/scan-progress-detail.md)
  sub_done INTEGER,                  -- позиція в підпослідовності (1-based): варіант синоніма / ціновий бакет / фаза verify
  sub_total INTEGER                  -- загальна кількість підпослідовності
);
