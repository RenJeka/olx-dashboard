// ── Семантичний фільтр релевантності (docs/plans/semantic-relevance-filter.md) ──

export interface RelevanceItem {
  id: number;
  relevant: boolean;
  reason: string;
}

export interface RelevanceResponse {
  results: RelevanceItem[];
  errors: string[];
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
}

export interface AnalysisCriteria {
  cons: string[];
  pros: string[];
}

export interface MatchedItem {
  criterion: string;
  evidence: string;
  ok: boolean;
}

export interface AnalyzedListing {
  id: number;
  items: MatchedItem[];
}

export interface AnalyzeResponse {
  results: AnalyzedListing[];
  errors: string[];
}

export interface PackagePart {
  name: string;
  content: string;
}

export interface CommitItem {
  id: number;
  criteria: string[];
}
