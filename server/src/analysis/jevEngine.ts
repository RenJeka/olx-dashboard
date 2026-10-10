// Рушій «Jev» для AI-кроків 1–2 (docs/ai-flow.md → «Рушій Jev», пілоти — docs/plans/jev-model.md).
// Поруч з LLM-рушієм (OpenRouter chat) і ручним ZIP: той самий контракт відповіді, але замість
// evidence — ймовірність ≥ порогу. Один state = один запит Decisions API, паралельно пулом.
// Нічого не пише в БД; генерація критеріїв і AI Вибір лишаються на LLM (Jev не генерує текст).
import type {
  AiUsage,
  AnalysisMode,
  AnalyzeResponse,
  AnalyzedListing,
  CriterionGroup,
  RelevanceItem,
  RelevanceResponse,
} from '../types.js';
import {
  JEV_CONCURRENCY,
  JEV_CRITERIA_THRESHOLD,
  JEV_MODEL,
  JEV_RELEVANCE_THRESHOLD,
  JEV_SHORT_DESC_SLICE,
  MATCHING_DESC_SLICE,
} from './constants.js';
import {
  RELEVANT_KEY,
  criteriaQuestions,
  criterionKey,
  decide,
  listingState,
  noulOf,
  relevanceQuestion,
  runPool,
  type JevQuestion,
  type JevResult,
} from './jev.js';
import { buildChunkListings, type ChunkListing, type PromptListing } from './prompts.js';
import { prefilterCandidates } from './relevance.js';

interface JevRun {
  /** id → результат (лише успішні запити). */
  byId: Map<number, JevResult>;
  usage: AiUsage;
  model: string;
  errors: string[];
}

/** Прогін пулом; збої окремих оголошень не валять прогін — зводяться в один рядок errors. */
async function runJev(items: ChunkListing[], descSlice: number, questions: Record<string, JevQuestion>): Promise<JevRun> {
  const results = await runPool(items, (l) => decide(listingState(l, descSlice), questions), JEV_CONCURRENCY);
  const run: JevRun = { byId: new Map(), usage: { requests: results.length, cost: 0 }, model: JEV_MODEL, errors: [] };
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (!r.ok) {
      failed.push(r.error);
      return;
    }
    run.usage.cost += r.value.usage.cost;
    run.model = r.value.model;
    run.byId.set((items[i] as ChunkListing).id, r.value);
  });
  if (failed.length > 0) run.errors.push(`Jev: не оброблено ${failed.length} з ${items.length} — ${failed[0]}`);
  return run;
}

/** Підпис вердикту кроку 1 (видно в UI й у `ai_relevant_reason`). */
export function jevReason(p: number): string {
  return `Jev ${p.toFixed(2)}`;
}

/**
 * Крок 1: код-префільтр (відсіяні — relevant=false, як у LLM-рушія) → Jev на короткому state
 * (опис ≤ JEV_SHORT_DESC_SLICE), EN-питання з ціллю й усіма синонімами пошуку (пілот: обрізання
 * синонімів дешевшає копійки, але губить справжні лоти) → relevant = p ≥ JEV_RELEVANCE_THRESHOLD.
 */
export async function runJevRelevance(
  target: string,
  listings: PromptListing[],
  aliases: string[] = [],
): Promise<RelevanceResponse> {
  const { candidates, rejected } = prefilterCandidates(target, listings, aliases);
  const question = { [RELEVANT_KEY]: relevanceQuestion(target, aliases, 'en') };
  const run = await runJev(buildChunkListings(candidates), JEV_SHORT_DESC_SLICE, question);

  const results: RelevanceItem[] = [...rejected];
  for (const [id, r] of run.byId) {
    const p = noulOf(r, RELEVANT_KEY);
    results.push({ id, relevant: p >= JEV_RELEVANCE_THRESHOLD, reason: jevReason(p) });
  }
  return { results, errors: run.errors, usage: run.usage, model: run.model };
}

/**
 * Крок 2: по noul на кожен критерій режиму на повному state (опис ≤ MATCHING_DESC_SLICE);
 * критерій знайдено, якщо p ≥ JEV_CRITERIA_THRESHOLD. evidence немає (Jev не повертає текст) —
 * `ok: true` означає «ймовірність ≥ порогу», сама ймовірність — у `probability`.
 */
export async function runJevMatching(
  groups: CriterionGroup[],
  mode: AnalysisMode,
  listings: PromptListing[],
  withAliases = true,
): Promise<AnalyzeResponse> {
  const byMode: Record<AnalysisMode, CriterionGroup[]> = { cons: [], pros: [], [mode]: groups };
  const questions = criteriaQuestions(byMode, 'en', withAliases);
  const run = await runJev(buildChunkListings(listings), MATCHING_DESC_SLICE, questions);

  const results: AnalyzedListing[] = [];
  for (const [id, r] of run.byId) {
    const items = groups.flatMap((g, i) => {
      const a = r.answers[criterionKey(mode, i)];
      return a?.type === 'noul' && a.noul >= JEV_CRITERIA_THRESHOLD
        ? [{ criterion: g.name, evidence: '', ok: true, probability: a.noul }]
        : [];
    });
    results.push({ id, items });
  }
  return { results, errors: run.errors, usage: run.usage, model: run.model };
}
