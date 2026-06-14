// Єдине джерело промптів LLM-аналізу — спільне для авто (OpenRouter) і ручного режиму.
// НЕ дублювати тексти промптів деінде.
import type { AnalysisMode } from '../types.js';
import {
  BASE_SCAFFOLD,
  CRITERIA_DESC_SLICE,
  DEFAULT_SAMPLE_SIZE,
  MATCHING_DESC_SLICE,
  MAX_CRITERIA,
  MAX_PARAMS_IN_PROMPT,
  MODE_NOUN,
  SAMPLE_SCORE_LENGTH_CAP,
  SAMPLE_SIGNAL_TOKEN_WEIGHT,
  SIGNAL_TOKENS,
} from './constants.js';
import { stripHtml } from './text.js';

/** Оголошення для matching (БЕЗ PII продавця). */
export interface PromptListing {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
}

/**
 * Промпт генерації критеріїв: базовий каркас + доповнення специфічними для категорії
 * на основі семпла описів. Вивід — JSON {"criteria": ["...", ...]}.
 */
export function buildCriteriaPrompt(
  category: string,
  sampleDescriptions: string[],
  mode: AnalysisMode,
  extra?: string,
): string {
  const scaffold = BASE_SCAFFOLD[mode].map((c) => `- ${c}`).join('\n');
  const samples = sampleDescriptions
    .map((d, i) => `[${i + 1}] ${stripHtml(d).slice(0, CRITERIA_DESC_SLICE)}`)
    .join('\n\n');

  return [
    `Ти — асистент для аналізу оголошень OLX. Категорія пошуку: "${category}".`,
    `Завдання: скласти список коротких КРИТЕРІЇВ, що описують ${MODE_NOUN[mode]}, ` +
      `за якими далі шукатимуть збіги в описах оголошень.`,
    '',
    'Базовий каркас (обовʼязково включити доречні з них):',
    scaffold,
    '',
    'Доповни список специфічними критеріями для цієї категорії на основі прикладів описів нижче.',
    'Приклади описів оголошень:',
    samples || '(описів недостатньо — спирайся на категорію та базовий каркас)',
    extra ? `\nДодаткові побажання користувача: ${extra}` : '',
    '',
    'Правила:',
    `- Поверни не більше ${MAX_CRITERIA} критеріїв.`,
    '- Кожен критерій — коротка фраза до 6 слів.',
    '- Усі критерії — УКРАЇНСЬКОЮ мовою, нормалізовані (різні формулювання → один критерій).',
    '- Без дублікатів і без пояснень.',
    '',
    'Формат відповіді — СУВОРО валідний JSON без тексту навколо:',
    '{"criteria": ["критерій 1", "критерій 2"]}',
  ].join('\n');
}

/** Оголошення для одного файлу `descriptions/chunk-NNN.json` ZIP-пакета (без PII). */
export interface ChunkListing {
  id: number;
  title: string | null;
  characteristics: string;
  description: string;
}

/** Роль + завдання + список дозволених критеріїв (спільне для matching-промптів). */
function matchingRoleAndCriteria(criteria: string[], mode: AnalysisMode): string {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
  return [
    `Ти — асистент для аналізу оголошень OLX. Знайди ${MODE_NOUN[mode]} у кожному оголошенні.`,
    '',
    'Список дозволених критеріїв (criterion МАЄ бути рівно одним із цих рядків):',
    criteriaList,
  ].join('\n');
}

/** Анти-галюцинаційні правила + формат відповіді (спільне для matching-промптів). */
function matchingRulesAndFormat(): string {
  return [
    'Правила:',
    '- Для кожного оголошення поверни знайдені збіги критеріїв.',
    '- criterion — ТІЛЬКИ з наведеного списку (нормалізуй: різні формулювання в описі → один критерій зі списку).',
    '- evidence — ДОСЛІВНИЙ фрагмент з опису цього оголошення, що підтверджує критерій. Нічого не вигадуй.',
    '- Якщо збігів немає — items: [].',
    '- Мова виводу критеріїв — українська (criterion беруться зі списку як є).',
    '',
    'Формат відповіді — СУВОРО валідний JSON-масив без тексту навколо:',
    '[{"id": <число>, "items": [{"criterion": "<зі списку>", "evidence": "<дослівно з опису>"}]}]',
  ].join('\n');
}

/** Текстовий блок одного оголошення для matching-промпту (id/назва/характеристики/опис). */
function buildListingBlock(l: PromptListing): string {
  const params = parseParamsLabel(l.params);
  const desc = stripHtml(l.description).slice(0, MATCHING_DESC_SLICE) || '(опис відсутній)';
  return [
    `### id: ${l.id}`,
    `Назва: ${l.title ?? '—'}`,
    params ? `Характеристики: ${params}` : '',
    `Опис: ${desc}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Промпт matching: для кожного оголошення повернути збіги критеріїв з дослівним evidence.
 * criterion ОБОВʼЯЗКОВО з наданого списку; evidence — дослівно з опису. БЕЗ PII у вході.
 * Авто-режим (`/analyze`): оголошення вставляються інлайн у текст промпту.
 */
export function buildMatchingPrompt(
  criteria: string[],
  listings: PromptListing[],
  mode: AnalysisMode,
): string {
  const items = listings.map(buildListingBlock).join('\n\n');

  return [
    matchingRoleAndCriteria(criteria, mode),
    '',
    'Оголошення:',
    items,
    '',
    matchingRulesAndFormat(),
  ].join('\n');
}

/**
 * Інструкції для ZIP-пакета ручного режиму (`prompt.txt`): роль/критерії +
 * формат вхідних файлів `descriptions/chunk-NNN.json` + ті самі правила matching,
 * але з вимогою опрацювати всі чанки й повернути ОДИН об'єднаний JSON-масив.
 */
export function buildManualZipInstructions(criteria: string[], mode: AnalysisMode): string {
  return [
    matchingRoleAndCriteria(criteria, mode),
    '',
    'Вхідні дані: у папці `descriptions/` лежать файли `chunk-NNN.json` — кожен містить JSON-масив',
    'оголошень формату {"id": <число>, "title": "...", "characteristics": "...", "description": "..."}.',
    '',
    "Завдання: опрацюй КОЖЕН файл з `descriptions/` і поверни ОДИН JSON-масив, що об'єднує",
    'результати для всіх оголошень з усіх файлів.',
    '',
    matchingRulesAndFormat(),
  ].join('\n');
}

/** Оголошення → компактний обʼєкт для файлу `descriptions/chunk-NNN.json` (без PII). */
export function buildChunkListings(listings: PromptListing[]): ChunkListing[] {
  return listings.map((l) => ({
    id: l.id,
    title: l.title,
    characteristics: parseParamsLabel(l.params),
    description: stripHtml(l.description).slice(0, MATCHING_DESC_SLICE) || '(опис відсутній)',
  }));
}

/** params (JSON {key:label}) → короткий рядок "label1, label2" для промпту. */
function parseParamsLabel(params: string | null): string {
  if (!params) return '';
  try {
    const obj = JSON.parse(params) as Record<string, string>;
    return Object.values(obj).filter(Boolean).slice(0, MAX_PARAMS_IN_PROMPT).join(', ');
  } catch {
    return '';
  }
}

/**
 * Семпл описів для генерації критеріїв: зважено за довжиною + наявністю сигнальних
 * токенів, топ-k. Вхід — рядки оголошень з description.
 */
export function pickSample<T extends { description: string | null }>(
  listings: T[],
  k = DEFAULT_SAMPLE_SIZE,
): T[] {
  const scored = listings
    .filter((l) => l.description)
    .map((l) => {
      const text = stripHtml(l.description).toLowerCase();
      const signalHits = SIGNAL_TOKENS.reduce((acc, tok) => (text.includes(tok) ? acc + 1 : acc), 0);
      const score =
        Math.min(text.length, SAMPLE_SCORE_LENGTH_CAP) + signalHits * SAMPLE_SIGNAL_TOKEN_WEIGHT;
      return { l, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((s) => s.l);
}
