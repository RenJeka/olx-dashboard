// Парсинг відповідей LLM (критерії + matching) + верифікація evidence.
// Спільне для авто (OpenRouter) і ручного режиму (вставлений текст із чату).
import type { AnalyzedListing, MatchedItem } from '../types.js';
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

interface RawMatch {
  id?: unknown;
  items?: unknown;
}

/**
 * Парс відповіді matching + верифікація evidence. Приймає масив [{id, items:[{criterion,
 * evidence}]}]. criterion лишаємо лише з дозволеного списку (нормалізація регістру);
 * ok=true якщо evidence підтверджено як підрядок опису.
 *
 * @param descriptions  id → plain-text опис (для substring-перевірки)
 * @param allowed       дозволені критерії (нормалізовані ключі lowercase → канонічний рядок)
 */
export function parseMatchingResponse(
  raw: string,
  descriptions: Map<number, string>,
  allowed: string[],
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

  const allowedMap = new Map<string, string>();
  for (const c of allowed) allowedMap.set(c.toLowerCase().trim(), c);

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
      const criterionRaw = typeof obj.criterion === 'string' ? normalizeCriterion(obj.criterion) : '';
      const evidence = typeof obj.evidence === 'string' ? obj.evidence.trim() : '';
      if (!criterionRaw) continue;

      // Зводимо criterion до канонічного з дозволеного списку (якщо є збіг).
      const canonical = allowedMap.get(criterionRaw.toLowerCase()) ?? criterionRaw;
      const key = canonical.toLowerCase();
      if (seenCriteria.has(key)) continue;
      seenCriteria.add(key);

      items.push({
        criterion: canonical,
        evidence,
        ok: evidenceConfirmed(evidence, description),
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
