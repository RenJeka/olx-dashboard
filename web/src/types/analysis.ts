// ── Семантичний фільтр релевантності (docs/plans/semantic-relevance-filter.md) ──

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

// ── AI Вибір позицій (план docs/plans/AI-auto-top.md) ────────────────────────

export interface PickItem {
  id: number;
  rank: number;
  reason: string;
}

export interface PickResult {
  picks: PickItem[];
  summary: string;
}

// ── LLM-аналіз (план docs/plans/llm-analysis.md) ─────────────────────────────

export type AnalysisMode = 'cons' | 'pros';

export interface AnalysisStatus {
  apiAvailable: boolean;
  defaultModel: string;
  jevAvailable?: boolean;
  jevModel?: string;
}

/** Категорія критерію (docs/plans/criteria-categories.md): назва + синоніми + чи йде в аналіз. */
export interface CriterionGroup {
  name: string;
  aliases: string[];
  enabled: boolean;
}

/** Категорії критеріїв пошуку за режимом (searches.analysis_criteria). */
export type CriteriaConfig = Record<AnalysisMode, CriterionGroup[]>;

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
