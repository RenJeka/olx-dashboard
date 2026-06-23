// ── Семантичний фільтр релевантності (план docs/plans/semantic-relevance-filter.md) ──

/** Вердикт релевантності одного оголошення (повертає LLM, парситься сервером). */
export interface RelevanceItem {
  id: number;
  /** true — лот продає цільовий товар; false — аксесуар/запчастина/згадка/«куплю». */
  relevant: boolean;
  /** Коротке пояснення вердикту. */
  reason: string;
}

/** Відповідь relevance-ендпойнтів (auto + manual import). */
export interface RelevanceResponse {
  results: RelevanceItem[];
  errors: string[];
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

/** Критерії аналізу на рівні пошуку (searches.analysis_criteria, JSON). */
export interface AnalysisCriteria {
  cons: string[];
  pros: string[];
}

/** Один знайдений збіг критерію в оголошенні (повертає LLM + прапорець верифікації). */
export interface MatchedItem {
  /** Нормалізований критерій з обраного списку. */
  criterion: string;
  /** Дослівний фрагмент опису (для верифікації/підсвітки); у БД НЕ зберігається. */
  evidence: string;
  /** evidence підтверджено як підрядок опису (анти-галюцинація). */
  ok: boolean;
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
