// Семантичний фільтр релевантності: для кожного оголошення вирішує, чи лот ПРОДАЄ
// цільовий товар (а не аксесуар/запчастину/згадку сумісності). Самодостатній модуль
// за зразком aiPicks.ts: промпти тримаються тут, числа — з constants.ts, без PII продавця.
import type { RelevanceItem, RelevanceResponse } from '../types.js';
import { AUTO_CHUNK_SIZE, DEFAULT_MODEL } from './constants.js';
import { hasApiKey } from './config.js';
import { chat } from './openrouter.js';
import { buildChunkListings, type PromptListing } from './prompts.js';
import { chunk } from './promptData.js';

/** Знімає ```json … ``` обгортку й вирізає перший JSON-обʼєкт/масив (для ручних вставок). */
function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const stripped = fenced ? (fenced[1] as string).trim() : trimmed;
  const first = stripped.search(/[[{]/);
  if (first === -1) return stripped;
  const last = Math.max(stripped.lastIndexOf(']'), stripped.lastIndexOf('}'));
  if (last <= first) return stripped;
  return stripped.slice(first, last + 1);
}

/** Спільні правила класифікації (інлайн-промпт + ZIP-інструкція). */
function relevanceRules(target: string): string {
  return [
    `Ти — асистент, що фільтрує видачу OLX за релевантністю до пошуку.`,
    `Цільовий товар: "${target}".`,
    '',
    'Головне питання для КОЖНОГО оголошення: чи цей лот ПРОДАЄ саме цей товар?',
    '- relevant=true: лот продає цільовий товар (новий або б/в, як основний товар АБО',
    '  у складі асортименту лота — продавець перелічує кілька позицій і серед них є потрібна).',
    '- relevant=false: лот про супутнє — чохол, плівка, захисне скло, підставка, кабель,',
    '  зарядка, адаптер, запчастина, ремонт/послуга, лише згадка сумісності («підходить для…»),',
    '  оголошення «куплю»/«обмін», або це зовсім інший товар.',
    'Враховуй назву, характеристики ТА опис.',
  ].join('\n');
}

/** Формат відповіді (спільний). */
function relevanceFormat(): string {
  return [
    'Формат відповіді — СТРОГО валідний JSON без тексту навколо:',
    '{"results": [{"id": <число>, "relevant": <true|false>, "reason": "<коротко чому>"}]}',
  ].join('\n');
}

/** Інлайн-промпт авто-режиму: оголошення подаються як JSON-масив. */
export function buildRelevancePrompt(target: string, listings: PromptListing[]): string {
  const items = buildChunkListings(listings);
  return [
    relevanceRules(target),
    '',
    `Оголошення (${items.length} шт.):`,
    JSON.stringify(items, null, 2),
    '',
    relevanceFormat(),
  ].join('\n');
}

/** Інструкція для ручного ZIP-пакета (`prompt.txt`) — без analyze.py (класифікація семантична). */
export function buildRelevanceZipInstructions(target: string): string {
  return [
    relevanceRules(target),
    '',
    'У теці `descriptions/` лежать файли `chunk-NNN.json` — масиви оголошень',
    '({id, title, characteristics, description}). Прочитай ВСІ чанки, класифікуй кожне',
    'оголошення й поверни ОДИН обʼєднаний JSON-масив результатів по всіх чанках разом.',
    '',
    relevanceFormat(),
  ].join('\n');
}

/** Парс відповіді: приймає {results:[...]} АБО голий масив. Фільтрує за validIds, дедуп за id. */
export function parseRelevanceResponse(raw: string, validIds: number[]): RelevanceItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error(`Не вдалось розпарсити відповідь AI: ${raw.slice(0, 200)}`);
  }

  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : [];

  const validIdSet = new Set(validIds);
  const seen = new Set<number>();
  const out: RelevanceItem[] = [];
  for (const entry of arr) {
    const obj = entry as Record<string, unknown>;
    const id = Number(obj.id);
    if (!Number.isFinite(id) || !validIdSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      relevant: obj.relevant === true || obj.relevant === 'true' || obj.relevant === 1,
      reason: String(obj.reason ?? ''),
    });
  }
  return out;
}

/** Авто-класифікація через OpenRouter: чанки по AUTO_CHUNK_SIZE, збір results + errors. */
export async function runRelevance(
  target: string,
  listings: PromptListing[],
  model?: string,
): Promise<RelevanceResponse> {
  if (!hasApiKey()) {
    throw new Error('Авто-режим недоступний: немає OPENROUTER_API_KEY');
  }

  const results: RelevanceItem[] = [];
  const errors: string[] = [];

  for (const batch of chunk(listings, AUTO_CHUNK_SIZE)) {
    const prompt = buildRelevancePrompt(target, batch);
    const validIds = batch.map((l) => l.id);
    try {
      const raw = await chat([{ role: 'user', content: prompt }], { model: model ?? DEFAULT_MODEL });
      results.push(...parseRelevanceResponse(raw, validIds));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { results, errors };
}
