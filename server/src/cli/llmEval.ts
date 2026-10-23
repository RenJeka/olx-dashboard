// Замір точності LLM-кроків «критерії» і «мінуси/плюси» (docs/plans/old/llm-haiku-prompt-audit.md). Лише вручну, ПЛАТНО
// (OpenRouter). У БД нічого не пише — лише SELECT із БД з server/.env. Суддя — людина чи агент: `report` дописує
// нерозмічені пункти у файл міток, той їх розмічає (`label`), повторний `report` рахує метрики.
//   npm run llm:eval -- run --search <id> --tag before [--models a,b] [--runs 2] [--listings 20] [--budget 0.15] [--out <file>]
//                          [--only gen|match] [--modes cons,pros]   # доміряти частину (той самий --tag, інший --out)
//   npm run llm:eval -- report <run.json> [<run.json> …] [--labels <file>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasApiKey } from '../analysis/config.js';
import { AUTO_CHUNK_SIZE, DEFAULT_MODEL, DEFAULT_SAMPLE_SIZE, OPPOSITE_MODE, isMode } from '../analysis/constants.js';
import { resolveEffectiveCriteria } from '../analysis/baseCriteria.js';
import { enabledGroups } from '../analysis/criteria.js';
import {
  buildReport,
  contextAround,
  formatReport,
  mergeLabelTodo,
  type EvalFile,
  type LabelEntry,
} from '../analysis/llmEval.js';
import { chatWithUsage, type ChatUsage } from '../analysis/openrouter.js';
import { excludeOppositeCriteria, parseCriteriaResponse, parseMatchingResponse } from '../analysis/parse.js';
import { chunk, descriptionMap, toPromptListing } from '../analysis/promptData.js';
import { buildCriteriaPrompt, buildMatchingPrompt, pickSample } from '../analysis/prompts.js';
import { getSearch, loadListings } from '../db/repos/analysis.js';
import type { AnalysisMode } from '../types.js';

const EVAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'llm-eval');
const MODES: AnalysisMode[] = ['cons', 'pros'];
const HAIKU_MODEL = 'anthropic/claude-haiku-5.5';

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/** Запобіжник бюджету: наступний виклик не стартує, якщо фактично витрачене + найдорожчий виклик > ліміту. */
class Budget {
  spent = 0;
  private maxCall = 0;
  constructor(private readonly limit: number) {}
  canSpend(): boolean {
    return this.spent + this.maxCall <= this.limit;
  }
  add(usage: ChatUsage): void {
    // Без cost від OpenRouter запобіжник сліпий — краще зупинитись, ніж витратити більше ліміту.
    if (usage.cost <= 0 && usage.prompt_tokens > 0) throw new Error('OpenRouter не повернув usage.cost — замір зупинено');
    const cost = usage.cost;
    this.spent += cost;
    this.maxCall = Math.max(this.maxCall, cost);
  }
}

async function run(): Promise<void> {
  const searchId = Number(arg('search'));
  const tag = arg('tag');
  if (!Number.isFinite(searchId) || !tag) throw new Error('Потрібні --search <id> і --tag <назва>');
  if (!hasApiKey()) throw new Error('OPENROUTER_API_KEY не налаштовано');
  const models = (arg('models') ?? `${DEFAULT_MODEL},${HAIKU_MODEL}`).split(',').map((m) => m.trim()).filter(Boolean);
  const runs = Number(arg('runs') ?? 2);
  const listingsN = Number(arg('listings') ?? 20);
  const budget = new Budget(Number(arg('budget') ?? 0.15));
  const out = arg('out') ?? join(EVAL_DIR, `${tag}.json`);
  const only = arg('only');
  const modes = (arg('modes')?.split(',') ?? MODES).filter(isMode);

  const search = await getSearch(searchId);
  if (!search) throw new Error(`Пошук ${searchId} не знайдено`);
  // Ефективний список (базові набори автокатегорії + власні) — як в аналізі.
  const { config } = await resolveEffectiveCriteria(search);
  const listings = await loadListings(searchId, []);
  const genSample = pickSample(listings, DEFAULT_SAMPLE_SIZE).map((l) => l.description ?? '');
  const matchSample = pickSample(listings, listingsN);
  const descriptions = descriptionMap(matchSample);

  const file: EvalFile = {
    tag, searchId, createdAt: new Date().toISOString(), complete: true, cost: 0,
    generation: [], matching: [], matchingRuns: [],
  };
  const save = () => {
    file.cost = budget.spent;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(file, null, 2));
  };
  const stop = (where: string) => {
    file.complete = false;
    console.log(`⛔ бюджет: зупинено перед «${where}», витрачено $${budget.spent.toFixed(4)}`);
  };

  // Генерація: свіжий список (без наявних критеріїв режиму, з критеріями протилежного — як у проді), прогони
  // чергуються між моделями — частковий прогін рівномірний.
  gen: for (let r = 1; r <= runs; r++) {
    if (only === 'match') break;
    for (const mode of modes) {
      for (const model of models) {
        if (!budget.canSpend()) { stop(`генерація ${model} ${mode} #${r}`); break gen; }
        const opposite = config[OPPOSITE_MODE[mode]];
        const prompt = buildCriteriaPrompt(search.name, genSample, mode, undefined, [], opposite);
        const { content, usage } = await chatWithUsage([{ role: 'user', content: prompt }], { model });
        budget.add(usage);
        try {
          const criteria = excludeOppositeCriteria(parseCriteriaResponse(content), opposite);
          file.generation.push({ model, mode, run: r, criteria, cost: usage.cost });
        } catch (err) {
          file.generation.push({ model, mode, run: r, criteria: [], cost: usage.cost, error: String(err) });
        }
        console.log(`генерація ${model} ${mode} #${r}: $${budget.spent.toFixed(4)}`);
        save();
      }
    }
  }

  // Пошук мінусів/плюсів: поточні ввімкнені категорії пошуку (як у проді), батчі AUTO_CHUNK_SIZE.
  if (file.complete && only !== 'gen') {
    match: for (const mode of modes) {
      const groups = enabledGroups(config, mode);
      if (groups.length === 0) continue;
      for (const model of models) {
        const info = { model, mode, listings: 0, unverified: 0, cost: 0, errors: [] as string[] };
        file.matchingRuns.push(info);
        for (const batch of chunk(matchSample, AUTO_CHUNK_SIZE)) {
          if (!budget.canSpend()) { stop(`пошук ${model} ${mode}`); break match; }
          const prompt = buildMatchingPrompt(groups, batch.map(toPromptListing), mode);
          const { content, usage } = await chatWithUsage([{ role: 'user', content: prompt }], { model });
          budget.add(usage);
          info.cost += usage.cost;
          info.listings += batch.length;
          try {
            for (const res of parseMatchingResponse(content, descriptions, groups)) {
              for (const it of res.items) {
                if (!it.ok) { info.unverified++; continue; }
                file.matching.push({
                  model, mode, listingId: res.id, criterion: it.criterion, evidence: it.evidence,
                  context: contextAround(descriptions.get(res.id) ?? '', it.evidence),
                });
              }
            }
          } catch (err) {
            info.errors.push(String(err));
          }
          console.log(`пошук ${model} ${mode}: $${budget.spent.toFixed(4)}`);
          save();
        }
      }
    }
  }
  save();
  console.log(`✔ ${out} · $${budget.spent.toFixed(4)} · complete=${file.complete}`);
}

function report(): void {
  const argv = process.argv.slice(3);
  const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--labels');
  if (files.length === 0) throw new Error('Потрібен хоча б один файл прогону');
  const labelsPath = arg('labels') ?? join(EVAL_DIR, 'labels.json');
  const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as EvalFile);
  const labels = existsSync(labelsPath) ? (JSON.parse(readFileSync(labelsPath, 'utf8')) as LabelEntry[]) : [];
  const merged = mergeLabelTodo(labels, runs);
  mkdirSync(dirname(labelsPath), { recursive: true });
  writeFileSync(labelsPath, JSON.stringify(merged, null, 2));
  const todo = merged.filter((l) => l.label === '').length;
  console.log(formatReport(buildReport(runs, merged)));
  console.log(`\nМітки: ${labelsPath} · нерозмічено: ${todo}`);
}

const command = process.argv[2];
(command === 'run' ? run() : command === 'report' ? Promise.resolve(report()) : Promise.reject(new Error('Команда: run | report')))
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
