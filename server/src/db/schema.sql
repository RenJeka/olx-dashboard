-- Канонічна схема БД OLX Dashboard (див. docs/olx-monitor-spec.md §5).
-- Застосовується при старті через db.ts (CREATE TABLE IF NOT EXISTS).
-- НЕ дублювати визначення таблиць у коді — джерело істини тут.

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
  photo_url TEXT,
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
  kind TEXT DEFAULT 'normal',        -- normal | deep | verify (Етап 2)
  started_at TEXT,
  finished_at TEXT,
  found INTEGER,
  new_count INTEGER,
  disabled_count INTEGER,
  error TEXT,
  requests_done INTEGER DEFAULT 0,   -- прогрес глибокого скану: виконано запитів
  requests_total INTEGER,            -- прогрес глибокого скану: ціль (NULL поки невідома)
  fetch_method TEXT                  -- GraphQL | HTML
);
