// Семантичний фільтр релевантності: для кожного оголошення вирішує, чи лот ПРОДАЄ
// цільовий товар (а не аксесуар/запчастину/згадку сумісності). Самодостатній модуль
// за зразком aiPicks.ts: промпти тримаються тут, числа — з constants.ts, без PII продавця.
import type { RelevanceItem, RelevanceResponse } from '../types.js';
import { AUTO_CHUNK_SIZE, DEFAULT_MODEL, RELEVANCE_PROXIMITY_WINDOW } from './constants.js';
import { hasApiKey } from './config.js';
import { chat } from './openrouter.js';
import { buildChunkListings, type PromptListing } from './prompts.js';
import { chunk } from './promptData.js';
import { normalizeForMatch, stripHtml } from './text.js';

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

/**
 * Інструкція для ручного ZIP-пакета (`prompt.txt`).
 *
 * Класифікація СЕМАНТИЧНА (детермінованого движка немає — модель сама судить кожен лот), але
 * МЕХАНІКА жорстко заскриптована: дані вже поділені на чанки, у пакеті лежать готові
 * `merge.py`/`verify.py`. Процедура «класифікуй чанк → result-NNN.json → merge → verify»
 * розрахована на слабкі агентні моделі (напр. Gemini Flash у Antigravity CLI): обробка чанків
 * по одному обходить ліміт довжини відповіді, а суворі заборони прибирають латитуду на
 * «дослідження датасету» й створення зайвих скриптів/«brain»-файлів.
 */
export function buildRelevanceZipInstructions(target: string): string {
  return [
    relevanceRules(target),
    '',
    'Це МЕХАНІЧНА процедура на файлах — НЕ дослідницька задача. Дані вже поділені на чанки.',
    'Твоє ЄДИНЕ змістове завдання — класифікувати кожне оголошення за правилами вище.',
    '',
    'Вміст пакета:',
    '- `descriptions/chunk-NNN.json` — вхідні оголошення ({id, title, characteristics, description}).',
    '- `merge.py`, `verify.py` — ГОТОВІ скрипти (Python, лише стандартна бібліотека).',
    '  НЕ редагувати, НЕ переписувати, НЕ копіювати їхню логіку.',
    '',
    'КРОК 1 — Класифікація. Для КОЖНОГО файлу `descriptions/chunk-NNN.json` ОКРЕМО:',
    '   1. Прочитай один chunk-NNN.json.',
    '   2. Класифікуй КОЖНЕ оголошення (relevant true/false + коротка причина).',
    '   3. Створи теку `classifications/` і запиши `classifications/result-NNN.json` (ТОЙ САМИЙ',
    '      номер NNN) — РІВНО валідний JSON-масив [{"id","relevant","reason"}], без markdown',
    '      і тексту навколо. Кожен id із чанку МАЄ бути у файлі.',
    '   4. Перейди до наступного чанку. Обробляй по одному — так не впираєшся в ліміт довжини',
    '      відповіді й не тримаєш усе в памʼяті.',
    '',
    'КРОК 2 — Обʼєднання: запусти РІВНО ОДИН раз `python merge.py` (або `python3`). Створить output.json.',
    '',
    'КРОК 3 — Перевірка: запусти `python verify.py`. Якщо звіт каже, що БРАКУЄ id — повернись до',
    '   КРОКУ 1 ЛИШЕ для відповідних чанків (онови їхні result-NNN.json), тоді знову `python merge.py`',
    '   і `python verify.py`. Коли verify.py пише «ПРОЙДЕНО» — ти ЗАКІНЧИВ.',
    '',
    'СУВОРО ЗАБОРОНЕНО (інакше завдання вважається проваленим):',
    '- створювати будь-які інші файли/скрипти, крім `classifications/result-NNN.json`',
    '  (жодних scan/check/draft/proximity/helper-скриптів, проміжних .txt-дампів, «brain»-нотаток);',
    '- редагувати/переписувати `merge.py` чи `verify.py`;',
    '- «досліджувати» датасет, рахувати статистику, вичищати/оптимізувати точність, класифікувати',
    '  чанк двічі; пропускати оголошення.',
    '',
    'РЕЗУЛЬТАТ: коли verify.py пройдено — встав ВМІСТ `output.json` у поле застосунку.',
    '',
    '── Fallback (ТІЛЬКИ якщо ти НЕ можеш запускати код): класифікуй усі чанки й поверни ОДИН',
    '   обʼєднаний JSON за схемою нижче. Помічних скриптів/файлів не створюй.',
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

// ── Евристичний пре-фільтр (перед ШІ) ───────────────────────────────────────

/** params (JSON {key:label}) → значення одним рядком (для пошуку токенів). */
function paramsText(params: string | null): string {
  if (!params) return '';
  try {
    const obj = JSON.parse(params) as Record<string, string>;
    return Object.values(obj).filter(Boolean).join(' ');
  } catch {
    return '';
  }
}

/** Текст оголошення для евристики: назва + опис + характеристики, нормалізований. */
function listingText(l: PromptListing): string {
  return normalizeForMatch(`${l.title ?? ''} ${stripHtml(l.description)} ${paramsText(l.params)}`);
}

/** Ціль → токени бренду (алфавітні, ≥2 символи) і номера моделі (суто цифрові). */
function parseTarget(target: string): { words: string[]; models: string[] } {
  const words: string[] = [];
  const models: string[] = [];
  for (const t of normalizeForMatch(target).split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(t)) models.push(t);
    else if (t.length >= 2) words.push(t);
  }
  return { words, models };
}

/**
 * Евристичний пре-фільтр перед ШІ: відсіює оголошення, де бренд і номер моделі НЕ стоять
 * поруч (напр. «iPhone 15» чи «батарея 5%» для цілі «iphone 5»). Обережний: якщо ціль без
 * номера моделі/бренду або фільтр відкинув би все — повертає всіх кандидатами (вирішує ШІ).
 * Детермінований, без мережі/БД. Відсіяні — звичайні RelevanceItem (relevant=false), які
 * показуються у списку результатів і лишаються виправними вручну.
 * Обмеження v1: розрахований на цілі формату «бренд + номер моделі».
 */
export function prefilterCandidates(
  target: string,
  listings: PromptListing[],
): { candidates: PromptListing[]; rejected: RelevanceItem[] } {
  const { words, models } = parseTarget(target);

  // Немає номера моделі або бренду — нема за чим розрізняти; пропускаємо всіх до ШІ.
  if (models.length === 0 || words.length === 0) {
    return { candidates: listings, rejected: [] };
  }

  // Слово == номер моделі АБО номер+літери ("5"→"5","5s","5c"), але НЕ "15"/"50"/"500".
  const modelRe = new RegExp(`^(?:${models.join('|')})[a-z]*$`);
  const brandSet = new Set(words);

  const candidates: PromptListing[] = [];
  const rejected: RelevanceItem[] = [];

  for (const l of listings) {
    const tokens = listingText(l)
      .split(/[^a-z0-9Ѐ-ӿ]+/)
      .filter(Boolean);
    const brandIdx: number[] = [];
    const modelIdx: number[] = [];
    tokens.forEach((tok, i) => {
      if (brandSet.has(tok)) brandIdx.push(i);
      if (modelRe.test(tok)) modelIdx.push(i);
    });

    const near = brandIdx.some((b) =>
      modelIdx.some((m) => Math.abs(b - m) <= RELEVANCE_PROXIMITY_WINDOW),
    );

    if (near) {
      candidates.push(l);
    } else {
      rejected.push({
        id: l.id,
        relevant: false,
        reason: `Авто-відсіяно: «${target}» не згадано поряд у тексті`,
      });
    }
  }

  // Запобіжник: якщо відкинули геть усе — ймовірно ціль надто строга; пропускаємо всіх.
  if (candidates.length === 0 && listings.length > 0) {
    return { candidates: listings, rejected: [] };
  }

  return { candidates, rejected };
}

/**
 * Авто-класифікація через OpenRouter: спершу евристичний пре-фільтр (відсіяні одразу
 * relevant=false), у ШІ йдуть лише кандидати чанками по AUTO_CHUNK_SIZE.
 */
export async function runRelevance(
  target: string,
  listings: PromptListing[],
  model?: string,
): Promise<RelevanceResponse> {
  if (!hasApiKey()) {
    throw new Error('Авто-режим недоступний: немає OPENROUTER_API_KEY');
  }

  const { candidates, rejected } = prefilterCandidates(target, listings);
  const results: RelevanceItem[] = [...rejected];
  const errors: string[] = [];

  for (const batch of chunk(candidates, AUTO_CHUNK_SIZE)) {
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
