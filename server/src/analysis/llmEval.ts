// Замір точності LLM-кроків «критерії» і «мінуси/плюси» (docs/plans/llm-haiku-prompt-audit.md): формат файлів
// прогону й міток, ключі міток і підрахунок метрик. Без мережі й БД — лише чисті функції (CLI — src/llmEval.ts).
import type { AnalysisMode } from '../types.js';
import { phraseKey } from './criteria.js';
import { normalizeForMatch } from './text.js';

/** Полярність критерію за суддею: мінус, плюс чи нейтральне (характеристика без оцінки). */
export type Polarity = 'drawback' | 'advantage' | 'neutral';
/** Вердикт судді для пари «критерій + evidence»: вірно; протилежна полярність; не підтверджує критерій. */
export type MatchVerdict = 'ok' | 'flipped' | 'wrong';

export interface GenerationSample {
  model: string;
  mode: AnalysisMode;
  run: number;
  criteria: string[];
  cost: number;
  error?: string;
}

export interface MatchSample {
  model: string;
  mode: AnalysisMode;
  listingId: number;
  criterion: string;
  evidence: string;
  /** Фрагмент опису навколо evidence — щоб суддя бачив заперечення поруч. */
  context: string;
}

export interface MatchingRunInfo {
  model: string;
  mode: AnalysisMode;
  listings: number;
  /** Пункти, що не пройшли перевірку evidence (у UI — знята галочка), у метрики не йдуть. */
  unverified: number;
  cost: number;
  errors: string[];
}

/** Файл одного прогону `npm run llm:eval -- run`. */
export interface EvalFile {
  tag: string;
  searchId: number;
  createdAt: string;
  /** false — прогін зупинив запобіжник бюджету. */
  complete: boolean;
  cost: number;
  generation: GenerationSample[];
  matching: MatchSample[];
  matchingRuns: MatchingRunInfo[];
}

/** Рядок файлу міток: `label` порожній — ще не розмічено. Решта полів — підказка судді. */
export interface LabelEntry {
  key: string;
  kind: 'criterion' | 'match';
  label: Polarity | MatchVerdict | '';
  mode: AnalysisMode;
  text: string;
  evidence?: string;
  context?: string;
}

export function criterionLabelKey(mode: AnalysisMode, text: string): string {
  return `c|${mode}|${phraseKey(text)}`;
}

export function matchLabelKey(m: Pick<MatchSample, 'mode' | 'listingId' | 'criterion' | 'evidence'>): string {
  return `m|${m.mode}|${m.listingId}|${phraseKey(m.criterion)}|${normalizeForMatch(m.evidence)}`;
}

/** Фрагмент `text` довкола `needle` (без урахування регістру); не знайдено — порожньо. */
export function contextAround(text: string, needle: string, radius = 80): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0 || !needle) return '';
  const from = Math.max(0, i - radius);
  const to = Math.min(text.length, i + needle.length + radius);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? '…' : ''}`;
}

/** Доповнює мітки записами для всього, що є в прогонах і ще не має ключа (порядок наявних не змінюється). */
export function mergeLabelTodo(labels: LabelEntry[], files: EvalFile[]): LabelEntry[] {
  const out = [...labels];
  const known = new Set(labels.map((l) => l.key));
  const add = (entry: LabelEntry) => {
    if (known.has(entry.key)) return;
    known.add(entry.key);
    out.push(entry);
  };
  for (const f of files) {
    for (const g of f.generation) {
      for (const text of g.criteria) {
        add({ key: criterionLabelKey(g.mode, text), kind: 'criterion', label: '', mode: g.mode, text });
      }
    }
    for (const m of f.matching) {
      add({
        key: matchLabelKey(m),
        kind: 'match',
        label: '',
        mode: m.mode,
        text: m.criterion,
        evidence: m.evidence,
        context: m.context,
      });
    }
  }
  return out;
}

/** Мінус у плюсах або плюс у мінусах; нейтральне — не помилка полярності. */
export function isWrongPolarity(mode: AnalysisMode, label: Polarity): boolean {
  return mode === 'cons' ? label === 'advantage' : label === 'drawback';
}

export interface ReportRow {
  tag: string;
  model: string;
  mode: AnalysisMode;
  /** Генерація: усі критерії всіх прогонів (з повторами між прогонами). */
  genTotal: number;
  genWrong: number;
  genNeutral: number;
  genUnlabeled: number;
  /** Пошук: лише пункти з підтвердженим evidence. */
  matchTotal: number;
  matchOk: number;
  matchFlipped: number;
  matchWrong: number;
  matchUnlabeled: number;
  cost: number;
}

/** Метрики по (тег, модель, режим). Нерозмічені пункти рахуються окремо й у частки не входять. */
export function buildReport(files: EvalFile[], labels: LabelEntry[]): ReportRow[] {
  const byKey = new Map(labels.filter((l) => l.label !== '').map((l) => [l.key, l.label]));
  const rows = new Map<string, ReportRow>();
  const row = (tag: string, model: string, mode: AnalysisMode): ReportRow => {
    const id = `${tag}|${model}|${mode}`;
    let r = rows.get(id);
    if (!r) {
      r = {
        tag, model, mode, genTotal: 0, genWrong: 0, genNeutral: 0, genUnlabeled: 0,
        matchTotal: 0, matchOk: 0, matchFlipped: 0, matchWrong: 0, matchUnlabeled: 0, cost: 0,
      };
      rows.set(id, r);
    }
    return r;
  };

  for (const f of files) {
    for (const g of f.generation) {
      const r = row(f.tag, g.model, g.mode);
      r.cost += g.cost;
      for (const text of g.criteria) {
        r.genTotal++;
        const label = byKey.get(criterionLabelKey(g.mode, text)) as Polarity | undefined;
        if (!label) r.genUnlabeled++;
        else if (label === 'neutral') r.genNeutral++;
        else if (isWrongPolarity(g.mode, label)) r.genWrong++;
      }
    }
    for (const info of f.matchingRuns) row(f.tag, info.model, info.mode).cost += info.cost;
    for (const m of f.matching) {
      const r = row(f.tag, m.model, m.mode);
      r.matchTotal++;
      const label = byKey.get(matchLabelKey(m)) as MatchVerdict | undefined;
      if (!label) r.matchUnlabeled++;
      else if (label === 'ok') r.matchOk++;
      else if (label === 'flipped') r.matchFlipped++;
      else r.matchWrong++;
    }
  }
  return [...rows.values()];
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)} %` : '—';
}

/** Markdown-таблиця звіту (для плану). */
export function formatReport(rows: ReportRow[]): string {
  const head =
    '| Тег | Модель | Режим | Критеріїв | Хибна полярність | Нейтр. | Пунктів пошуку | Precision | Перевернуто | Не те | Нерозмічено | $ |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const lines = rows.map((r) => {
    const genLabeled = r.genTotal - r.genUnlabeled;
    const matchLabeled = r.matchTotal - r.matchUnlabeled;
    return `| ${r.tag} | ${r.model} | ${r.mode} | ${r.genTotal} | ${r.genWrong} (${pct(r.genWrong, genLabeled)}) | ` +
      `${r.genNeutral} | ${r.matchTotal} | ${pct(r.matchOk, matchLabeled)} | ${r.matchFlipped} | ${r.matchWrong} | ` +
      `${r.genUnlabeled + r.matchUnlabeled} | ${r.cost.toFixed(4)} |`;
  });
  return [head, ...lines].join('\n');
}
