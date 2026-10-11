// Пілот Jev для AI-кроків 1+2 (docs/plans/jev-model.md): заміряє вартість і згоду Jev з еталоном
// на вибірці. Нічого не пише в БД — лише читає JSON-вибірку й пише звіт поруч.
//   npm run jev:pilot -- --export <searchId> [--limit N]   # вибірка з БД з server/.env (лише SELECT)
//   npm run jev:pilot -- [--sample <path>] [--limit N] [--variants L,A1s,A1f,A2,B,UK]
//                        [--model <llm>] [--concurrency N] [--rel-threshold <JEV_RELEVANCE_THRESHOLD>] [--uk-limit N]
//                        [--max-aliases N] [--out <dir>]   # синонімів у питанні Jev; тека звіту
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasApiKey } from './analysis/config.js';
import {
  AUTO_CHUNK_SIZE,
  DEFAULT_MODEL,
  JEV_CONCURRENCY,
  JEV_CRITERIA_THRESHOLD,
  JEV_RELEVANCE_THRESHOLD,
  JEV_SHORT_DESC_SLICE,
  MATCHING_DESC_SLICE,
} from './analysis/constants.js';
import {
  RELEVANT_KEY,
  criteriaAbove,
  criteriaQuestions,
  decide,
  listingState,
  noulOf,
  relevanceQuestion,
  runPool,
  type JevLang,
  type JevQuestion,
  type JevResult,
} from './analysis/jev.js';
import { chatWithUsage } from './analysis/openrouter.js';
import { parseMatchingResponse } from './analysis/parse.js';
import { descriptionMap, chunk } from './analysis/promptData.js';
import { buildChunkListings, buildMatchingPrompt, type ChunkListing, type PromptListing } from './analysis/prompts.js';
import { buildRelevancePrompt, parseRelevanceResponse, prefilterCandidates } from './analysis/relevance.js';
import { parseBullets } from './analysis/text.js';
import type { AnalysisMode, CriterionGroup } from './types.js';
import { enabledGroups, parseCriteriaConfig } from './analysis/criteria.js';

// ── Вхід ───────────────────────────────────────────────────────────────────────

interface SampleListing {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
  ai_relevant: number | null;
  ai_relevant_source: string | null;
  cons: string | null;
  pros: string | null;
  analysis_source: string | null;
  /** Посилання на OLX — для ручної розмітки спірних (у старих вибірках може не бути). */
  url?: string | null;
}

interface Sample {
  search: {
    id: number;
    query: string;
    relevance_target: string | null;
    query_synonyms: string | null;
    analysis_criteria: string | null;
  };
  listings: SampleListing[];
}

const PILOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'jev-pilot');
const THRESHOLDS = [0.3, 0.5, 0.7, 0.9];
const ALL_VARIANTS = ['L', 'A1s', 'A1f', 'A2', 'B', 'UK'] as const;
type Variant = (typeof ALL_VARIANTS)[number];

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function jsonArray(text: string | null): string[] {
  try {
    const v: unknown = JSON.parse(text || '[]');
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
  } catch {
    return [];
  }
}

/** Категорії «в аналізі» за режимом (спільний парс — analysis/criteria.ts). */
function parseCriteria(text: string | null): Record<AnalysisMode, CriterionGroup[]> {
  const config = parseCriteriaConfig(text);
  return { cons: enabledGroups(config, 'cons'), pros: enabledGroups(config, 'pros') };
}

// ── Облік вартості ─────────────────────────────────────────────────────────────

interface CostLine {
  variant: string;
  listings: number;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

function newCost(variant: string): CostLine {
  return { variant, listings: 0, requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
}

/** Прогін Jev по оголошеннях: id → результат (помилки рахуються, не валять прогін). */
async function runJev(
  line: CostLine,
  items: ChunkListing[],
  descSlice: number,
  questions: Record<string, JevQuestion>,
  concurrency: number,
): Promise<Map<number, JevResult>> {
  const results = await runPool(items, (l) => decide(listingState(l, descSlice), questions), concurrency);
  const out = new Map<number, JevResult>();
  results.forEach((r, i) => {
    line.requests++;
    if (!r.ok) {
      line.errors++;
      if (line.errors <= 3) console.warn(`[${line.variant}] id=${items[i]?.id}: ${r.error}`);
      return;
    }
    line.listings++;
    line.inputTokens += r.value.usage.input_tokens;
    line.outputTokens += r.value.usage.output_tokens;
    line.cost += r.value.usage.cost;
    out.set((items[i] as ChunkListing).id, r.value);
  });
  return out;
}

// ── Метрики ────────────────────────────────────────────────────────────────────

interface Confusion {
  n: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

function confusion(pred: Map<number, boolean>, gold: Map<number, boolean>): Confusion {
  const c: Confusion = { n: 0, tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const [id, g] of gold) {
    const p = pred.get(id);
    if (p === undefined) continue;
    c.n++;
    if (p && g) c.tp++;
    else if (p && !g) c.fp++;
    else if (!p && g) c.fn++;
    else c.tn++;
  }
  return c;
}

const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((100 * a) / b)}%`);

function confusionCells(c: Confusion): string {
  return `${c.n} | ${pct(c.tp, c.tp + c.fp)} | ${pct(c.tp, c.tp + c.fn)} | ${pct(c.tp + c.tn, c.n)} | ${c.tp}/${c.fp}/${c.fn}/${c.tn}`;
}

function atThreshold(probs: Map<number, number>, t: number): Map<number, boolean> {
  return new Map([...probs].map(([id, p]) => [id, p >= t]));
}

/** Пари (id|mode|criterion) для порівняння множин критеріїв. */
function pairKeys(byId: Map<number, Record<AnalysisMode, string[]>>): Set<string> {
  const s = new Set<string>();
  for (const [id, rec] of byId) for (const mode of ['cons', 'pros'] as const) for (const c of rec[mode]) s.add(`${id}|${mode}|${c.toLowerCase()}`);
  return s;
}

function setAgreement(pred: Set<string>, ref: Set<string>): string {
  let tp = 0;
  for (const k of pred) if (ref.has(k)) tp++;
  return `${pct(tp, pred.size)} | ${pct(tp, ref.size)} | ${tp}/${pred.size - tp}/${ref.size - tp}`;
}

const usd = (n: number) => `$${n.toFixed(6)}`;
const per1000 = (cost: number, listings: number) => (listings === 0 ? '—' : `$${((cost / listings) * 1000).toFixed(4)}`);

// ── Спірні випадки для ручної розмітки ─────────────────────────────────────────

/** Ключ «LLM дав результат для оголошення в цьому режимі». */
const llmDoneKey = (id: number, mode: AnalysisMode) => `${id}|${mode}`;

const DISPUTE_DESC_CHARS = 400;

/** Рядок-посилання на оголошення (порожньо, якщо url у вибірці немає). */
const olxLink = (r: SampleListing): string[] => (r.url ? [`[Відкрити на OLX](${r.url})`] : []);

/**
 * disputes.md: оголошення, де Jev (продові пороги кроків 1 і 2) і свіжий LLM розходяться. Людина ставить
 * відповідь у квадратних дужках — це еталон якості замість «збігу з LLM». Режим, для якого LLM не дав
 * результату (збій запиту), не вважається відповіддю «ні» — такі пари пропускаються.
 */
function buildDisputes(
  rows: SampleListing[],
  jevRel: Map<number, number> | undefined,
  llmRel: Map<number, boolean>,
  jevCrit: Map<number, JevResult> | undefined,
  llmCrit: Map<number, Record<AnalysisMode, string[]>>,
  llmCritDone: Set<string>,
  criteria: Record<AnalysisMode, CriterionGroup[]>,
): string {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const text = (r: SampleListing) =>
    (r.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, DISPUTE_DESC_CHARS);
  const md: string[] = ['# Спірні випадки Jev vs LLM', '', 'Впишіть відповідь у `[ ]`: `т` — так, `н` — ні. Решту не чіпайте.', ''];
  md.push('## Крок 1 — чи оголошення продає цільовий товар?', '');
  for (const [id, p] of jevRel ?? []) {
    const llm = llmRel.get(id);
    const r = byId.get(id);
    if (llm === undefined || !r || p >= JEV_RELEVANCE_THRESHOLD === llm) continue;
    md.push(`### R${id} [ ]  ${r.title ?? ''}`, ...olxLink(r), `Jev ${p.toFixed(2)} · LLM ${llm ? 'так' : 'ні'}`, '', `> ${text(r)}`, '');
  }
  md.push('## Крок 2 — чи є в оголошенні цей мінус/плюс?', '');
  for (const [id, res] of jevCrit ?? []) {
    const r = byId.get(id);
    if (!r) continue;
    const jev = criteriaAbove(res, criteria, JEV_CRITERIA_THRESHOLD);
    const llm = llmCrit.get(id) ?? { cons: [], pros: [] };
    const lines: string[] = [];
    for (const mode of ['cons', 'pros'] as const) {
      if (!llmCritDone.has(llmDoneKey(id, mode))) continue;
      const j = new Set(jev[mode]);
      const l = new Set(llm[mode]);
      for (const c of new Set([...j, ...l])) {
        if (j.has(c) === l.has(c)) continue;
        lines.push(`- [ ] ${mode === 'cons' ? 'мінус' : 'плюс'} «${c}» — ${j.has(c) ? 'Jev так, LLM ні' : 'LLM так, Jev ні'}`);
      }
    }
    if (lines.length > 0) md.push(`### C${id}  ${r.title ?? ''}`, ...olxLink(r), ...lines, '', `> ${text(r)}`, '');
  }
  return md.join('\n');
}

// ── Експорт вибірки (лише SELECT) ──────────────────────────────────────────────

/**
 * Вивантажує вибірку пошуку з БД, на яку вказує server/.env (локальний файл або Turso), у
 * sample.json. Пріоритет — уже проаналізовані й розмічені оголошення (є з чим порівнювати).
 */
async function exportSample(searchId: number, limit: number, out: string): Promise<void> {
  const { dbAll, dbGet } = await import('./db/db.js');
  const search = await dbGet<Sample['search']>(
    'SELECT id, query, relevance_target, query_synonyms, analysis_criteria FROM searches WHERE id = ?',
    [searchId],
  );
  if (!search) {
    console.error(`Пошук #${searchId} не знайдено`);
    process.exit(1);
  }
  const listings = await dbAll<SampleListing>(
    `SELECT id, title, description, params, ai_relevant, ai_relevant_source, cons, pros, analysis_source, url
       FROM listings WHERE search_id = ?
      ORDER BY (analysis_source IS NOT NULL) DESC, (ai_relevant IS NOT NULL) DESC, id DESC
      LIMIT ?`,
    [searchId, limit],
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ search, listings } satisfies Sample, null, 2));
  console.log(`Вибірка: пошук #${searchId} «${search.query}», оголошень ${listings.length} → ${out}`);
}

// ── Основний прогін ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const exportId = arg('export');
  if (exportId !== undefined) {
    await exportSample(Number(exportId), Number(arg('limit') ?? 200), arg('sample') ?? join(PILOT_DIR, 'sample.json'));
    return;
  }
  if (!hasApiKey()) {
    console.error('Немає OPENROUTER_API_KEY у server/.env — пілот не може викликати Jev/LLM.');
    process.exit(1);
  }
  const samplePath = arg('sample') ?? join(PILOT_DIR, 'sample.json');
  const outDir = arg('out') ?? PILOT_DIR;
  const limit = Number(arg('limit') ?? Infinity);
  const model = arg('model') ?? DEFAULT_MODEL;
  const concurrency = Number(arg('concurrency') ?? JEV_CONCURRENCY);
  const relThreshold = Number(arg('rel-threshold') ?? JEV_RELEVANCE_THRESHOLD);
  const ukLimit = Number(arg('uk-limit') ?? 60);
  const variants = new Set<Variant>(
    (arg('variants')?.split(',') ?? [...ALL_VARIANTS]).filter((v): v is Variant => (ALL_VARIANTS as readonly string[]).includes(v)),
  );

  let sample: Sample;
  try {
    sample = JSON.parse(readFileSync(samplePath, 'utf8')) as Sample;
  } catch (err) {
    console.error(`Не вдалося прочитати вибірку ${samplePath}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const rows = sample.listings.slice(0, limit);
  const target = (sample.search.relevance_target ?? '').trim() || sample.search.query;
  const aliases = jsonArray(sample.search.query_synonyms);
  // Синоніми в питанні Jev оплачуються в кожному запиті → обрізаються (префільтр бачить усі).
  const maxAliases = arg('max-aliases');
  const jevAliases = maxAliases === undefined ? aliases : aliases.slice(0, Number(maxAliases));
  const criteria = parseCriteria(sample.search.analysis_criteria);
  const lang: JevLang = 'en';

  const promptListings: PromptListing[] = rows.map((r) => ({ id: r.id, title: r.title, description: r.description, params: r.params }));
  const { candidates, rejected } = prefilterCandidates(target, promptListings, aliases);
  const chunkById = new Map(buildChunkListings(candidates).map((c) => [c.id, c]));
  const cands = [...chunkById.values()];
  console.log(`Вибірка: ${rows.length}, після префільтра в AI: ${cands.length} (відсіяно кодом ${rejected.length}).`);

  // Еталони: manual — «золото»; api/import — збережений результат LLM.
  const gold = new Map<number, boolean>();
  const llmStored = new Map<number, boolean>();
  for (const r of rows) {
    if (r.ai_relevant === null) continue;
    (r.ai_relevant_source === 'manual' ? gold : llmStored).set(r.id, r.ai_relevant === 1);
  }
  const storedCriteria = new Map<number, Record<AnalysisMode, string[]>>();
  const allowed = {
    cons: new Set(criteria.cons.map((g) => g.name.toLowerCase())),
    pros: new Set(criteria.pros.map((g) => g.name.toLowerCase())),
  };
  for (const r of rows) {
    if (!r.analysis_source) continue;
    storedCriteria.set(r.id, {
      cons: parseBullets(r.cons).filter((c) => allowed.cons.has(c.toLowerCase())),
      pros: parseBullets(r.pros).filter((c) => allowed.pros.has(c.toLowerCase())),
    });
  }

  const costs: CostLine[] = [];
  const rel = new Map<string, Map<number, number>>(); // варіант → id → p(relevant)
  const crit = new Map<string, Map<number, JevResult>>(); // варіант → id → відповіді критеріїв
  const llmRel = new Map<number, boolean>();
  const llmCrit = new Map<number, Record<AnalysisMode, string[]>>();
  const llmCritDone = new Set<string>();
  const relQ = { [RELEVANT_KEY]: relevanceQuestion(target, jevAliases, lang) };
  const critQ = criteriaQuestions(criteria, lang);
  const hasCriteria = Object.keys(critQ).length > 0;

  // L — поточний LLM-рушій (база вартості й якості).
  if (variants.has('L')) {
    const line = newCost(`L1 (LLM ${model}, релевантність)`);
    for (const batch of chunk(candidates, AUTO_CHUNK_SIZE)) {
      line.requests++;
      try {
        const r = await chatWithUsage([{ role: 'user', content: buildRelevancePrompt(target, batch, aliases) }], { model });
        line.inputTokens += r.usage.prompt_tokens;
        line.outputTokens += r.usage.completion_tokens;
        line.cost += r.usage.cost;
        for (const it of parseRelevanceResponse(r.content, batch.map((b) => b.id))) llmRel.set(it.id, it.relevant);
        line.listings += batch.length;
      } catch (err) {
        line.errors++;
        console.warn(`[L1] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    costs.push(line);

    if (hasCriteria) {
      const line2 = newCost(`L2 (LLM ${model}, мінуси+плюси, лише релевантні за L1)`);
      const relevantRows = candidates.filter((c) => llmRel.get(c.id) === true);
      const descMap = descriptionMap(relevantRows);
      for (const batch of chunk(relevantRows, AUTO_CHUNK_SIZE)) {
        for (const mode of ['cons', 'pros'] as const) {
          if (criteria[mode].length === 0) continue;
          line2.requests++;
          try {
            const r = await chatWithUsage([{ role: 'user', content: buildMatchingPrompt(criteria[mode], batch, mode) }], { model });
            line2.inputTokens += r.usage.prompt_tokens;
            line2.outputTokens += r.usage.completion_tokens;
            line2.cost += r.usage.cost;
            for (const a of parseMatchingResponse(r.content, descMap, criteria[mode])) {
              const rec = llmCrit.get(a.id) ?? { cons: [], pros: [] };
              rec[mode] = a.items.filter((i) => i.ok).map((i) => i.criterion);
              llmCrit.set(a.id, rec);
              llmCritDone.add(llmDoneKey(a.id, mode));
            }
          } catch (err) {
            line2.errors++;
            console.warn(`[L2] ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        line2.listings += batch.length;
      }
      costs.push(line2);
    }
  }

  const relProbs = (m: Map<number, JevResult>) => new Map([...m].map(([id, r]) => [id, noulOf(r, RELEVANT_KEY)]));

  if (variants.has('A1s') || variants.has('A2')) {
    const line = newCost(`A1-short (Jev, релевантність, опис ≤${JEV_SHORT_DESC_SLICE})`);
    rel.set('A1s', relProbs(await runJev(line, cands, JEV_SHORT_DESC_SLICE, relQ, concurrency)));
    costs.push(line);
  }
  if (variants.has('A1f')) {
    const line = newCost(`A1-full (Jev, релевантність, опис ≤${MATCHING_DESC_SLICE})`);
    rel.set('A1f', relProbs(await runJev(line, cands, MATCHING_DESC_SLICE, relQ, concurrency)));
    costs.push(line);
  }
  if (variants.has('A2') && hasCriteria) {
    const a1 = rel.get('A1s') ?? new Map<number, number>();
    const relevant = cands.filter((c) => (a1.get(c.id) ?? 0) >= relThreshold);
    const line = newCost(`A2 (Jev, критерії, лише релевантні за A1-short ≥${relThreshold})`);
    crit.set('A2', await runJev(line, relevant, MATCHING_DESC_SLICE, critQ, concurrency));
    costs.push(line);
  }
  if (variants.has('B')) {
    const line = newCost('B (Jev, релевантність + критерії одним запитом)');
    const res = await runJev(line, cands, MATCHING_DESC_SLICE, { ...relQ, ...critQ }, concurrency);
    rel.set('B', relProbs(res));
    if (hasCriteria) crit.set('B', new Map([...res].filter(([, r]) => noulOf(r, RELEVANT_KEY) >= relThreshold)));
    costs.push(line);
  }
  if (variants.has('UK')) {
    const line = newCost(`UK (Jev, релевантність українською, опис ≤${JEV_SHORT_DESC_SLICE}, перші ${ukLimit})`);
    const ukQ = { [RELEVANT_KEY]: relevanceQuestion(target, jevAliases, 'uk') };
    rel.set('UK', relProbs(await runJev(line, cands.slice(0, ukLimit), JEV_SHORT_DESC_SLICE, ukQ, concurrency)));
    costs.push(line);
  }

  // ── Звіт ──
  const uniqueStates = new Set(cands.map((c) => JSON.stringify(listingState(c, MATCHING_DESC_SLICE)))).size;
  const md: string[] = [];
  md.push(`# Jev-пілот — звіт`, '');
  md.push(`- Дата: ${new Date().toISOString()}; пошук #${sample.search.id} «${sample.search.query}», ціль «${target}»${aliases.length ? `, синоніми: ${aliases.join(', ')}` : ''}; у питанні Jev синонімів ${jevAliases.length}.`);
  md.push(`- Вибірка ${rows.length}; у AI після префільтра ${cands.length}; унікальних state ${uniqueStates}.`);
  md.push(`- Еталон релевантності: manual ${gold.size}, збережений LLM ${llmStored.size}. Збережених аналізів мінусів/плюсів: ${storedCriteria.size}.`);
  md.push(`- Критеріїв: мінуси ${criteria.cons.length}, плюси ${criteria.pros.length}. Поріг релевантності для A2/B: ${relThreshold}.`, '');

  md.push('## Вартість', '', '| Варіант | Оголошень | Запитів | Помилок | Вхідних токенів/оголошення | Вартість | На 1000 оголошень |', '|---|---|---|---|---|---|---|');
  for (const c of costs) {
    md.push(`| ${c.variant} | ${c.listings} | ${c.requests} | ${c.errors} | ${c.listings ? Math.round(c.inputTokens / c.listings) : '—'} | ${usd(c.cost)} | ${per1000(c.cost, c.listings)} |`);
  }
  const sum = (prefix: string[]) => costs.filter((c) => prefix.some((p) => c.variant.startsWith(p))).reduce((s, c) => s + c.cost, 0);
  md.push('', `Шляхи на ${cands.length} оголошень (після префільтра): L = ${usd(sum(['L1', 'L2']))}, A = A1-short + A2 = ${usd(sum(['A1-short', 'A2']))}, B = ${usd(sum(['B ']))}.`);
  md.push('Увага: вартість LLM (L) залежить від `usage.cost` OpenRouter; 0 означає, що провайдер не віддав cost.', '');

  // Відсіяні код-префільтром — вердикт «ні» для будь-якого рушія (як у проді), а не «немає даних».
  const withRejected = (pred: Map<number, boolean>) => new Map([...rejected.map((r): [number, boolean] => [r.id, false]), ...pred]);
  md.push('## Крок 1 — релевантність', '', 'Колонки: n | precision | recall | accuracy | tp/fp/fn/tn. Відсіяні префільтром рахуються як «ні».', '');
  for (const [refName, ref] of [['manual (золото)', gold], ['збережений LLM', llmStored]] as const) {
    if (ref.size === 0) continue;
    md.push(`### Проти: ${refName}`, '', '| Варіант | Поріг | n | P | R | Acc | tp/fp/fn/tn |', '|---|---|---|---|---|---|---|');
    if (llmRel.size) md.push(`| L1 свіжий LLM | — | ${confusionCells(confusion(withRejected(llmRel), ref))} |`);
    for (const [name, probs] of rel) for (const t of THRESHOLDS) md.push(`| ${name} | ${t} | ${confusionCells(confusion(withRejected(atThreshold(probs, t)), ref))} |`);
    md.push('');
  }

  const restrict = <T,>(m: Map<number, T>, ids: Set<number>) => new Map([...m].filter(([id]) => ids.has(id)));
  const critRefs: [string, Map<number, Record<AnalysisMode, string[]>>][] = [
    ['збережений LLM', storedCriteria],
    ['свіжий L2', llmCrit],
  ];
  for (const [refName, ref] of critRefs) {
    if (!hasCriteria || ref.size === 0) continue;
    md.push(`## Крок 2 — мінуси/плюси проти: ${refName}`, '', 'Колонки: precision | recall | tp/fp/fn (пари оголошення×критерій, лише оголошення з обох боків).', '');
    md.push('| Варіант | Поріг | P | R | tp/fp/fn |', '|---|---|---|---|---|');
    if (ref !== llmCrit && llmCrit.size) {
      const ids = new Set([...llmCrit.keys()].filter((id) => ref.has(id)));
      md.push(`| L2 свіжий LLM | — | ${setAgreement(pairKeys(restrict(llmCrit, ids)), pairKeys(restrict(ref, ids)))} |`);
    }
    for (const [name, results] of crit) {
      const ids = new Set([...results.keys()].filter((id) => ref.has(id)));
      for (const t of THRESHOLDS) {
        const pred = new Map([...results].filter(([id]) => ids.has(id)).map(([id, r]) => [id, criteriaAbove(r, criteria, t)]));
        md.push(`| ${name} | ${t} | ${setAgreement(pairKeys(pred), pairKeys(restrict(ref, ids)))} |`);
      }
    }
    md.push('');
  }

  mkdirSync(outDir, { recursive: true });
  const raw = {
    relevance: Object.fromEntries([...rel].map(([k, m]) => [k, Object.fromEntries(m)])),
    criteria: Object.fromEntries([...crit].map(([k, m]) => [k, Object.fromEntries([...m].map(([id, r]) => [id, r.answers]))])),
    llmRelevance: Object.fromEntries(llmRel),
    llmCriteria: Object.fromEntries(llmCrit),
    costs,
  };
  writeFileSync(join(outDir, 'raw.json'), JSON.stringify(raw, null, 2));
  writeFileSync(join(outDir, 'report.md'), md.join('\n'));
  writeFileSync(join(outDir, 'disputes.md'), buildDisputes(rows, rel.get('A1s'), llmRel, crit.get('A2'), llmCrit, llmCritDone, criteria));
  console.log(md.join('\n'));
  console.log(`\nЗвіт: ${join(outDir, 'report.md')}`);
}

await main();
