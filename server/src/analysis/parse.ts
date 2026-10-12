// Парсинг відповідей LLM (критерії + matching) + верифікація evidence.
// Спільне для авто (OpenRouter) і ручного режиму (вставлений текст із чату).
import type { AnalyzedListing, CriterionGroup, GroupSuggestion, MatchedItem } from '../types.js';
import { aliasMap, phraseKey } from './criteria.js';
import { MAX_CRITERIA, MAX_SYNONYMS } from './constants.js';
import { evidenceConfirmed } from './text.js';

/** Знімає ```json … ``` обгортку (ручні вставки часто з нею). */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? (fenced[1] as string).trim() : trimmed;
}

/** Дістає перший JSON-обʼєкт/масив із тексту (на випадок зайвих слів навколо). */
function extractJson(text: string): string {
  const stripped = stripCodeFence(text);
  const firstBrace = stripped.search(/[[{]/);
  if (firstBrace === -1) return stripped;
  const lastBrace = Math.max(stripped.lastIndexOf(']'), stripped.lastIndexOf('}'));
  if (lastBrace <= firstBrace) return stripped;
  return stripped.slice(firstBrace, lastBrace + 1);
}

function normalizeCriterion(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Номер рядка списку, який модель копіює в назву критерію: «5. сервісна батарея», «2) …». */
const LIST_NUMBER_RE = /^\d+\s*[.)]\s*/;
/** Критерій-заперечення: «не працює Face ID», «без коробки», «немає зарядного». */
const NEGATED_CRITERION_RE = /^(не|без|немає|нема|відсутн\p{L}*)\s+(.+)$/iu;
/** Слова заперечення чи обмеження в evidence. */
const NEGATION_WORDS = /^(не|ні|без|немає|нема|нет|відсутн\p{L}*|отсутств\p{L}*|тільки|лише|только)$/u;
/** Скільки перших літер слова звіряти (грубий стем: «повна» ~ «повний», «торгу» ~ «торг»). */
const STEM_LENGTH = 4;

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Evidence суперечить критерію-запереченню (docs/plans/llm-haiku-prompt-audit.md, H3): критерій «не X», а evidence
 * містить усі слова X без жодного заперечення — «Не працює Face ID» + «Face ID працює», «не повна комплектація» +
 * «повна комплектація». Такий фрагмент є в описі, тож перевірку підрядка проходить — ловимо окремо.
 */
export function contradictsNegatedCriterion(criterion: string, evidence: string): boolean {
  const m = NEGATED_CRITERION_RE.exec(criterion.trim());
  if (!m) return false;
  const evWords = words(evidence);
  if (evWords.some((w) => NEGATION_WORDS.test(w))) return false;
  const stems = words(m[2] as string)
    .filter((w) => w.length >= 2)
    .map((w) => w.slice(0, STEM_LENGTH));
  return stems.length > 0 && stems.every((stem) => evWords.some((w) => w.startsWith(stem)));
}

/**
 * Згенеровані критерії без тих, що вже є назвою чи синонімом протилежного режиму: «повна комплектація» у плюсах →
 * не пропонувати її в мінусах (docs/plans/llm-haiku-prompt-audit.md, H2).
 */
export function excludeOppositeCriteria(criteria: string[], opposite: CriterionGroup[]): string[] {
  const taken = aliasMap(opposite);
  return criteria.filter((c) => !taken.has(phraseKey(c)));
}

/**
 * Парс відповіді генерації критеріїв: приймає масив рядків АБО {criteria:[...]}.
 * Нормалізує, дедуплікує (case-insensitive), відкидає порожні, обрізає до MAX_CRITERIA.
 */
export function parseCriteriaResponse(raw: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Не вдалося розпарсити відповідь як JSON (критерії)');
  }

  let list: unknown[];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object' && Array.isArray((data as { criteria?: unknown }).criteria)) {
    list = (data as { criteria: unknown[] }).criteria;
  } else {
    throw new Error('Очікувався масив критеріїв або {criteria: [...]}');
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const norm = normalizeCriterion(item);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(norm);
    if (result.length >= MAX_CRITERIA) break;
  }
  return result;
}

/**
 * Парс відповіді генерації синонімів: приймає масив рядків АБО {synonyms:[...]}.
 * Нормалізує, дедуплікує (case-insensitive), відкидає порожні, обрізає до MAX_SYNONYMS.
 */
export function parseSynonymsResponse(raw: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Не вдалося розпарсити відповідь як JSON (синоніми)');
  }

  let list: unknown[];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object' && Array.isArray((data as { synonyms?: unknown }).synonyms)) {
    list = (data as { synonyms: unknown[] }).synonyms;
  } else {
    throw new Error('Очікувався масив синонімів або {synonyms: [...]}');
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const norm = normalizeCriterion(item);
    if (!norm) continue;
    const key = norm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(norm);
    if (result.length >= MAX_SYNONYMS) break;
  }
  return result;
}

/**
 * Парс відповіді автогрупування (docs/plans/old/criteria-auto-group.md, docs/plans/llm-haiku-prompt-audit.md):
 * {items: [{criterion, aspect}]} або масив таких пунктів. Критерій зводиться до назви зі списку (регістр, синонім,
 * хвіст «(сюди ж: …)»); невідомий чи повторний — відкидається. Критерії з однаковим аспектом (без регістру й зайвих
 * пробілів) — одна група; група з < 2 членів відкидається. Члени — у порядку списку; назва групи — член із
 * найбільшою кількістю синонімів (за рівності — перший у списку), тож назва завжди є критерієм цієї групи.
 */
export function parseGroupSuggestions(raw: string, groups: CriterionGroup[]): GroupSuggestion[] {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Не вдалося розпарсити відповідь як JSON (групування)');
  }

  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : [];

  const known = aliasMap(groups);
  const order = new Map(groups.map((g, i) => [phraseKey(g.name), i]));
  const aliasCount = new Map(groups.map((g) => [phraseKey(g.name), g.aliases.length]));
  const seen = new Set<string>();
  const byAspect = new Map<string, string[]>();

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as { criterion?: unknown; aspect?: unknown };
    if (typeof obj.criterion !== 'string' || typeof obj.aspect !== 'string') continue;
    const canonical = known.get(phraseKey(obj.criterion.replace(/\s*\(сюди ж:.*$/i, '')));
    const aspect = normalizeCriterion(obj.aspect).toLowerCase();
    if (canonical === undefined || aspect === '' || seen.has(phraseKey(canonical))) continue;
    seen.add(phraseKey(canonical));
    byAspect.set(aspect, [...(byAspect.get(aspect) ?? []), canonical]);
  }

  const rank = (name: string) => order.get(phraseKey(name)) ?? 0;
  const out: GroupSuggestion[] = [];
  for (const members of byAspect.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => rank(a) - rank(b));
    const name = members.reduce((best, m) =>
      (aliasCount.get(phraseKey(m)) ?? 0) > (aliasCount.get(phraseKey(best)) ?? 0) ? m : best,
    );
    out.push({ name, members });
  }
  return out.sort((a, b) => rank(a.members[0] as string) - rank(b.members[0] as string));
}

interface RawMatch {
  id?: unknown;
  items?: unknown;
}

/**
 * Парс відповіді matching + верифікація evidence. Приймає масив [{id, items:[{criterion,
 * evidence}]}]. criterion зводиться до назви категорії: збіг із назвою чи синонімом (без регістру),
 * хвіст «(сюди ж: …)», якщо модель скопіювала рядок списку цілком, відкидається;
 * ok=true якщо evidence підтверджено як підрядок опису.
 *
 * @param descriptions  id → plain-text опис (для substring-перевірки)
 * @param groups        категорії режиму (назва + синоніми)
 */
export function parseMatchingResponse(
  raw: string,
  descriptions: Map<number, string>,
  groups: CriterionGroup[],
): AnalyzedListing[] {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Не вдалося розпарсити відповідь як JSON (matching)');
  }

  const arr: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
      ? (data as { results: unknown[] }).results
      : [];
  if (!Array.isArray(arr)) {
    throw new Error('Очікувався масив [{id, items}]');
  }

  const allowedMap = aliasMap(groups);

  const out: AnalyzedListing[] = [];
  for (const entry of arr) {
    const row = entry as RawMatch;
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;

    const description = descriptions.get(id) ?? '';
    const rawItems = Array.isArray(row.items) ? row.items : [];
    const items: MatchedItem[] = [];
    const seenCriteria = new Set<string>();

    for (const it of rawItems) {
      const obj = it as { criterion?: unknown; evidence?: unknown };
      const criterionRaw =
        typeof obj.criterion === 'string'
          ? normalizeCriterion(obj.criterion.replace(/\s*\(сюди ж:.*$/i, '').replace(LIST_NUMBER_RE, ''))
          : '';
      const evidence = typeof obj.evidence === 'string' ? obj.evidence.trim() : '';
      if (!criterionRaw) continue;

      // Зводимо criterion до канонічного з дозволеного списку; поза списком («7 GB» при «8 GB») — відкидаємо.
      const canonical = allowedMap.get(phraseKey(criterionRaw));
      if (!canonical) continue;
      const key = canonical.toLowerCase();
      if (seenCriteria.has(key)) continue;
      seenCriteria.add(key);

      items.push({
        criterion: canonical,
        evidence,
        ok: evidenceConfirmed(evidence, description) && !contradictsNegatedCriterion(canonical, evidence),
      });
    }

    out.push({ id, items });
  }

  return out;
}

/**
 * Мерж результатів (для кількох послідовних ручних вставок): обʼєднання за id,
 * дедуплікація items за criterion (новіший перетирає для evidence/ok).
 */
export function mergeResults(
  accumulated: AnalyzedListing[],
  incoming: AnalyzedListing[],
): AnalyzedListing[] {
  const byId = new Map<number, Map<string, MatchedItem>>();

  const ingest = (list: AnalyzedListing[]) => {
    for (const row of list) {
      if (!byId.has(row.id)) byId.set(row.id, new Map());
      const itemMap = byId.get(row.id) as Map<string, MatchedItem>;
      for (const item of row.items) {
        itemMap.set(item.criterion.toLowerCase(), item);
      }
    }
  };

  ingest(accumulated);
  ingest(incoming);

  return Array.from(byId.entries()).map(([id, itemMap]) => ({
    id,
    items: Array.from(itemMap.values()),
  }));
}
