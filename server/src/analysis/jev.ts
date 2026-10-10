// Jev — decision-модель TypeSafe через OpenRouter Decisions API (docs/jev.md). Не LLM: на вхід
// state + типізовані питання, на вихід лише ймовірності (без тексту/evidence). Один state на
// запит → масовість паралельним пулом із спільною паузою на 429. Без PII продавця у state.
import type { AnalysisMode, CriterionGroup } from '../types.js';
import { getApiKey } from './config.js';
import {
  JEV_BACKOFF_CAP_MS,
  JEV_DECISIONS_URL,
  JEV_MAX_ATTEMPTS,
  JEV_MODEL,
  JEV_TIMEOUT_MS,
  OPENROUTER_ERROR_DETAIL_MAX_CHARS,
  OPENROUTER_REFERER,
  OPENROUTER_TITLE,
} from './constants.js';
import type { ChunkListing } from './prompts.js';

// ── Типи запиту/відповіді ──────────────────────────────────────────────────────

export interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
}
export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}
export interface JevScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}
export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

export type JevAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence?: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence?: number; probabilities: Record<string, number> };

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
  cost: number;
}

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
}

export type JevState = string | Record<string, string>;

// ── Парсинг (чистий, тестується) ───────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isProb(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

function numberRecord(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(v)) return out;
  for (const [k, n] of Object.entries(v)) if (typeof n === 'number') out[k] = n;
  return out;
}

function parseAnswer(raw: unknown): JevAnswer | null {
  if (!isRecord(raw)) return null;
  const confidence = isProb(raw.confidence) ? raw.confidence : undefined;
  if (raw.type === 'noul' && isProb(raw.noul)) return { type: 'noul', noul: raw.noul };
  if (raw.type === 'choice' && typeof raw.choice === 'string') {
    return { type: 'choice', choice: raw.choice, confidence, probabilities: numberRecord(raw.probabilities) };
  }
  if (raw.type === 'score' && typeof raw.score === 'number') {
    return { type: 'score', score: raw.score, confidence, probabilities: numberRecord(raw.probabilities) };
  }
  return null;
}

/**
 * Валідує тіло відповіді Decisions API. Кожне задане питання має отримати відповідь свого
 * типу, `usage.cost` — число (відсутня вартість ≠ безкоштовно → помилка).
 */
export function parseDecisionsResponse(body: unknown, questions: Record<string, JevQuestion>): JevResult {
  if (!isRecord(body) || !isRecord(body.answers) || !isRecord(body.usage)) {
    throw new Error('Jev: неочікуваний формат відповіді (немає answers/usage)');
  }
  const { usage } = body;
  if (typeof usage.cost !== 'number' || typeof usage.input_tokens !== 'number') {
    throw new Error('Jev: у відповіді немає usage.cost / usage.input_tokens');
  }
  const answers: Record<string, JevAnswer> = {};
  for (const [key, q] of Object.entries(questions)) {
    const answer = parseAnswer(body.answers[key]);
    if (!answer || answer.type !== q.type) {
      throw new Error(`Jev: немає валідної відповіді «${key}» типу ${q.type}`);
    }
    answers[key] = answer;
  }
  return {
    model: typeof body.model === 'string' ? body.model : JEV_MODEL,
    answers,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : 0,
      cost: usage.cost,
    },
  };
}

/** Ймовірність «так» для noul-відповіді (кидає, якщо тип інший — помилка коду, не даних). */
export function noulOf(result: JevResult, key: string): number {
  const a = result.answers[key];
  if (!a || a.type !== 'noul') throw new Error(`Jev: «${key}» не noul`);
  return a.noul;
}

// ── HTTP-клієнт ────────────────────────────────────────────────────────────────

/** Тимчасова помилка (429 / 5xx / 402 in-flight budget / мережа) — варто повторити. */
export class JevRetryableError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | undefined,
  ) {
    super(message);
  }
}

function isInFlightBudget(body: string): boolean {
  try {
    const json: unknown = JSON.parse(body);
    return (
      isRecord(json) &&
      isRecord(json.error) &&
      isRecord(json.error.metadata) &&
      json.error.metadata.limit_source === 'openrouter_in_flight_budget'
    );
  } catch {
    return false;
  }
}

/** Один запит до Decisions API без ретраїв. */
async function decideOnce(state: JevState, questions: Record<string, JevQuestion>): Promise<JevResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не налаштовано (Jev недоступний)');

  let res: Response;
  let text: string;
  try {
    res = await fetch(JEV_DECISIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_TITLE,
      },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    throw new JevRetryableError(`Jev: мережа — ${err instanceof Error ? err.message : String(err)}`, undefined);
  }

  if (!res.ok) {
    const detail = `Jev HTTP ${res.status}: ${text.slice(0, OPENROUTER_ERROR_DETAIL_MAX_CHARS)}`;
    const transient = res.status === 429 || res.status >= 500 || (res.status === 402 && isInFlightBudget(text));
    if (!transient) throw new Error(detail);
    const retryAfter = Number(res.headers.get('Retry-After')) * 1000;
    throw new JevRetryableError(detail, retryAfter > 0 && Number.isFinite(retryAfter) ? retryAfter : undefined);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Jev: відповідь не JSON');
  }
  return parseDecisionsResponse(json, questions);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Спільна пауза всього пулу: один 429 зупиняє всіх воркерів до pausedUntil. */
let pausedUntil = 0;

/** Запит із ретраями (backoff або Retry-After; пауза спільна для паралельних воркерів). */
export async function decide(state: JevState, questions: Record<string, JevQuestion>): Promise<JevResult> {
  for (let attempt = 0; ; attempt++) {
    while (Date.now() < pausedUntil) await sleep(pausedUntil - Date.now());
    try {
      return await decideOnce(state, questions);
    } catch (err) {
      if (!(err instanceof JevRetryableError) || attempt + 1 >= JEV_MAX_ATTEMPTS) throw err;
      const backoff = err.retryAfterMs ?? Math.min(JEV_BACKOFF_CAP_MS, 1000 * 2 ** attempt) + Math.random() * 1000;
      pausedUntil = Math.max(pausedUntil, Date.now() + backoff);
    }
  }
}

/**
 * Пул із фіксованою кількістю воркерів. Помилка елемента не валить прогін — повертається
 * як `{ error }` на його позиції (порядок результатів = порядок входу).
 */
export async function runPool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<({ ok: true; value: R } | { ok: false; error: string })[]> {
  const out = new Array<{ ok: true; value: R } | { ok: false; error: string }>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (next < items.length) {
        const index = next++;
        try {
          out[index] = { ok: true, value: await worker(items[index] as T) };
        } catch (err) {
          out[index] = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
      }
    }),
  );
  return out;
}

// ── State і питання для AI-кроків ──────────────────────────────────────────────

/** State оголошення (без PII): назва + характеристики + опис, обрізаний до descSlice. */
export function listingState(l: ChunkListing, descSlice: number): Record<string, string> {
  const state: Record<string, string> = { title: l.title ?? '' };
  if (l.characteristics) state.characteristics = l.characteristics;
  state.description = l.description.slice(0, descSlice);
  return state;
}

export type JevLang = 'en' | 'uk';

/** Ключ noul-питання фільтра релевантності. */
export const RELEVANT_KEY = 'relevant';

/** Питання «чи лот продає саме цільовий товар» — та сама межа, що в relevanceRules (relevance.ts). */
export function relevanceQuestion(target: string, aliases: string[], lang: JevLang): JevNoulQuestion {
  const names = [target, ...aliases].map((n) => `"${n}"`).join(lang === 'en' ? ' or ' : ' або ');
  if (lang === 'uk') {
    return {
      type: 'noul',
      instructions: `Чи це оголошення продає сам товар ${names}?`,
      criteria: {
        true: 'Продає сам товар (новий чи б/в), як основний або один із кількох перелічених товарів.',
        false: 'Аксесуар, чохол, скло, кабель, зарядка, запчастина, ремонт, лише сумісність, «куплю»/«обмін» або інший товар.',
      },
    };
  }
  return {
    type: 'noul',
    instructions: `Does this listing sell the product ${names} itself?`,
    criteria: {
      true: 'It sells the product itself (new or used), as the main item or one of several listed items.',
      false: 'Accessory, case, glass, cable, charger, spare part, repair, compatibility mention only, buy/exchange request, or another product.',
    },
  };
}

/** Ключ noul-питання критерію: `cons_3`, `pros_0` (індекс у списку критеріїв режиму). */
export function criterionKey(mode: AnalysisMode, index: number): string {
  return `${mode}_${index}`;
}

/**
 * Межа «так/ні» для критеріїв. Без неї Jev читає «state» буквально й занижує ймовірності — пропускає
 * перефразовані мінуси/плюси (експеримент «формулювання × поріг», docs/plans/jev-model.md → етап 3).
 */
const CRITERION_BOUNDARY: Record<JevLang, { true: string; false: string }> = {
  en: { true: 'Stated or clearly implied.', false: 'Not mentioned, or the opposite.' },
  uk: { true: 'Прямо сказано або явно випливає.', false: 'Не згадано або сказано протилежне.' },
};

/**
 * Текст noul-питання категорії (без межі `criteria`). Синоніми категорії — приклади в дужках
 * (docs/plans/criteria-categories.md): одне питання на категорію замість питання на кожне формулювання.
 */
function criterionInstructions(mode: AnalysisMode, group: CriterionGroup, lang: JevLang, withAliases: boolean): string {
  const examples = withAliases && group.aliases.length > 0 ? group.aliases.map((a) => `"${a}"`).join(', ') : '';
  if (lang === 'uk') {
    const hint = examples ? ` (напр. ${examples})` : '';
    return `Чи має товар ${mode === 'cons' ? 'такий недолік' : 'таку перевагу'}: «${group.name}»${hint}?`;
  }
  const hint = examples ? ` (e.g. ${examples})` : '';
  return `Does this item have the following ${mode === 'cons' ? 'drawback' : 'advantage'}: "${group.name}"${hint}?`;
}

/**
 * По одному noul на кожну категорію мінусів/плюсів пошуку (з межею «так/ні»).
 * `withAliases = false` — лише назва (порівняння в `jev:probe`).
 */
export function criteriaQuestions(
  criteria: Record<AnalysisMode, CriterionGroup[]>,
  lang: JevLang,
  withAliases = true,
): Record<string, JevNoulQuestion> {
  const out: Record<string, JevNoulQuestion> = {};
  for (const mode of ['cons', 'pros'] as const) {
    criteria[mode].forEach((g, i) => {
      out[criterionKey(mode, i)] = {
        type: 'noul',
        instructions: criterionInstructions(mode, g, lang, withAliases),
        criteria: CRITERION_BOUNDARY[lang],
      };
    });
  }
  return out;
}

/** Категорії, чия ймовірність ≥ threshold (за режимом; назви категорій). */
export function criteriaAbove(
  result: JevResult,
  criteria: Record<AnalysisMode, CriterionGroup[]>,
  threshold: number,
): Record<AnalysisMode, string[]> {
  const out: Record<AnalysisMode, string[]> = { cons: [], pros: [] };
  for (const mode of ['cons', 'pros'] as const) {
    criteria[mode].forEach((g, i) => {
      const a = result.answers[criterionKey(mode, i)];
      if (a?.type === 'noul' && a.noul >= threshold) out[mode].push(g.name);
    });
  }
  return out;
}
