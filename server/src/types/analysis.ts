// ── Семантичний фільтр релевантності (план docs/plans/semantic-relevance-filter.md) ──

/** Вердикт релевантності одного оголошення (повертає LLM, парситься сервером). */
export interface RelevanceItem {
  id: number;
  /** true — лот продає цільовий товар; false — аксесуар/запчастина/згадка/«куплю». */
  relevant: boolean;
  /** Коротке пояснення вердикту. */
  reason: string;
}

/** Рушій авто-режиму кроків 1–2: LLM (OpenRouter chat) або Jev (decision-модель, docs/jev.md). */
export type AnalysisEngine = 'llm' | 'jev';

/** Облік прогону рушія (поки — лише для Jev, у якого `usage.cost` на кожен запит). */
export interface AiUsage {
  requests: number;
  /** Сума `usage.cost`, $. */
  cost: number;
}

/** Відповідь relevance-ендпойнтів (auto + manual import). */
export interface RelevanceResponse {
  results: RelevanceItem[];
  errors: string[];
  /** Рушій Jev: облік і версія моделі прогону. */
  usage?: AiUsage;
  model?: string;
}

// ── AI Вибір позицій (план docs/plans/AI-auto-top.md) ────────────────────────

/** Кандидат для AI-ранжування (без PII продавця). */
export interface PickCandidate {
  id: number;
  title: string | null;
  price: number | null;
  city: string | null;
  params: string | null;
  description: string | null;
  pros: string;
}

/** Один обраний AI елемент. */
export interface PickItem {
  id: number;
  rank: number;
  reason: string;
}

/** Відповідь AI-ранжування. */
export interface PickResult {
  picks: PickItem[];
  summary: string;
}

// ── LLM-аналіз (план docs/plans/llm-analysis.md) ─────────────────────────────

/** Режим аналізу: мінуси чи плюси. Критерії й промпти різні, механіка однакова. */
export type AnalysisMode = 'cons' | 'pros';

/**
 * Категорія критерію (docs/plans/criteria-categories.md): назва, яку пише аналіз, + синоніми — формулювання,
 * що зводяться до неї (LLM-генерація, старі прогони, ручний едіт) + чи йде в аналіз (`enabled`).
 */
export interface CriterionGroup {
  name: string;
  aliases: string[];
  enabled: boolean;
}

/** Критерії аналізу на рівні пошуку (searches.analysis_criteria, JSON) — пул категорій за режимом. */
export type CriteriaConfig = Record<AnalysisMode, CriterionGroup[]>;

/** Один знайдений збіг критерію в оголошенні (повертає LLM + прапорець верифікації). */
export interface MatchedItem {
  /** Нормалізований критерій з обраного списку. */
  criterion: string;
  /** Дослівний фрагмент опису (для верифікації/підсвітки); у БД НЕ зберігається. */
  evidence: string;
  /** evidence підтверджено як підрядок опису (анти-галюцинація); для рушія Jev — ймовірність ≥ порогу. */
  ok: boolean;
  /** Рушій Jev: ймовірність критерію (evidence тоді порожній). */
  probability?: number;
}

/** Результат аналізу одного оголошення (для кроку «Перевірка»). */
export interface AnalyzedListing {
  id: number;
  items: MatchedItem[];
}

/** Відповідь matching-ендпойнтів (auto + manual import). */
export interface AnalyzeResponse {
  results: AnalyzedListing[];
  errors: string[];
  /** Рушій Jev: облік і версія моделі прогону (commit пише її в analysis_model). */
  usage?: AiUsage;
  model?: string;
}

/** Один елемент запису в БД (commit). */
export interface CommitItem {
  id: number;
  criteria: string[];
}

/** Частина пакета для ручного режиму (один файл/чат). */
export interface PackagePart {
  name: string;
  content: string;
}
