// ── Семантичний фільтр релевантності (docs/plans/old/semantic-relevance-filter.md) ──

export interface RelevanceItem {
  id: number;
  relevant: boolean;
  reason: string;
}

/** Рушій авто-режиму кроків 1–2 (docs/ai-flow.md → «Рушій Jev»). */
export type AnalysisEngine = 'llm' | 'jev';

/** Облік прогону рушія Jev. */
export interface AiUsage {
  requests: number;
  cost: number;
}

export interface RelevanceResponse {
  results: RelevanceItem[];
  errors: string[];
  usage?: AiUsage;
  model?: string;
}

// ── AI Вибір позицій (план docs/plans/old/AI-auto-top.md) ────────────────────────

export interface PickItem {
  id: number;
  rank: number;
  reason: string;
}

export interface PickResult {
  picks: PickItem[];
  summary: string;
}

// ── LLM-аналіз (план docs/plans/old/llm-analysis.md) ─────────────────────────────

export type AnalysisMode = 'cons' | 'pros';

export interface AnalysisStatus {
  apiAvailable: boolean;
  defaultModel: string;
  jevAvailable?: boolean;
  jevModel?: string;
}

/** Категорія критерію (docs/plans/old/criteria-categories.md): назва + синоніми + чи йде в аналіз. */
export interface CriterionGroup {
  name: string;
  aliases: string[];
  enabled: boolean;
  /**
   * Базовий пункт категорії (docs/plans/old/base-criteria.md): звідки успадковано. Лише у відповідях API —
   * на сервері не зберігається.
   */
  base?: CriterionBase;
}

/** Атрибуція базового пункту: категорія OLX, у чиєму наборі він заданий. */
export interface CriterionBase {
  categoryId: number;
  label: string;
}

/** Категорії критеріїв пошуку за режимом (searches.analysis_criteria). */
export type CriteriaConfig = Record<AnalysisMode, CriterionGroup[]>;

/** Автокатегорія пошуку: id і шлях від кореня (docs/plans/old/base-criteria.md). */
export interface CriteriaCategory {
  id: number;
  path: string[];
}

/** Відповідь GET/PUT /api/searches/:id/criteria: ефективні набори (базові + власні) + автокатегорія. */
export type CriteriaResponse = CriteriaConfig & { category: CriteriaCategory | null };

// ── Базові набори категорій OLX (docs/plans/old/base-criteria.md) ────────────────────

/** Вузол дерева категорій OLX (GET /api/categories) + чи є в нього непорожній базовий набір. */
export interface OlxCategoryItem {
  id: number;
  parentId: number | null;
  label: string;
  slug: string;
  hasSet: boolean;
}

/** GET /api/categories/:id/criteria: власний набір категорії + злиті набори її предків (пункти з `base`). */
export interface CategoryCriteriaResponse {
  own: CriteriaConfig;
  inherited: CriteriaConfig;
}

/** Відповідь POST /api/categories/:id/criteria/remap. */
export interface CategoryRemapResult {
  /** Власний набір категорії після зміни. */
  criteria: CriteriaConfig;
  /** Оголошень, у яких змінились пункти (пошуки категорії та її підкатегорій). */
  updated: number;
  /** Пошуків, у яких змінились оголошення. */
  searches: number;
}

/** Відповідь POST /api/categories/collect. */
export interface CollectCategoriesResult {
  requested: number;
  /** Скільки вузлів додано чи оновлено. */
  changed: number;
  /** Слова, на яких збір не вдався. */
  failed: string[];
}

/** Пропозиція автогрупування (docs/plans/old/criteria-auto-group.md): назва категорії + ≥ 2 назви критеріїв. */
export interface GroupSuggestion {
  name: string;
  members: string[];
}

/** Одне об'єднання в POST /criteria/remap (`merges`). */
export interface CriteriaMerge {
  from: string[];
  to: string;
}

/** Відповідь POST /criteria/remap. */
export interface RemapCriteriaResult {
  criteria: CriteriaConfig;
  /** Оголошень, у яких змінились пункти. */
  updated: number;
  filtered_out_count: number | null;
}

export interface MatchedItem {
  criterion: string;
  evidence: string;
  ok: boolean;
  /** Рушій Jev: ймовірність критерію (evidence порожній). */
  probability?: number;
}

export interface AnalyzedListing {
  id: number;
  items: MatchedItem[];
}

export interface AnalyzeResponse {
  results: AnalyzedListing[];
  errors: string[];
  usage?: AiUsage;
  model?: string;
}

export interface PackagePart {
  name: string;
  content: string;
}

export interface CommitItem {
  id: number;
  criteria: string[];
}
