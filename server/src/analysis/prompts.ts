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
 * Інструкції для ZIP-пакета ручного режиму (`prompt.txt`).
 *
 * ЖОРСТКО ОБМЕЖЕНА однопрохідна процедура для агента з виконанням коду (Antigravity CLI,
 * Claude Code): єдине творче завдання — написати `patterns.json` з лінгвістичних знань, тоді
 * запустити `analyze.py` РІВНО ОДИН раз. Явні заборони + умова STOP свідомо прибирають латитуду
 * на «дослідження датасету / вичищення false positives», через яку слабкі моделі зациклюються.
 * Останній рядок — мінімальний fallback для асистента без виконання коду.
 */
export function buildManualZipInstructions(criteria: string[], mode: AnalysisMode): string {
  return [
    matchingRoleAndCriteria(criteria, mode),
    '',
    'Це МЕХАНІЧНЕ завдання на 2 кроки, А НЕ дослідницька задача. Виконай рівно два кроки нижче',
    'й зупинись. Не аналізуй датасет, не оптимізуй точність — це робить готовий движок.',
    '',
    'Вміст пакета:',
    '- `analyze.py` — ГОТОВИЙ детермінований движок (Python, лише стандартна бібліотека). НЕ',
    '  переписувати, НЕ редагувати, НЕ копіювати його логіку в інший файл.',
    '- `descriptions/chunk-NNN.json` — вхідні оголошення (їх читає САМ движок; тобі читати НЕ треба).',
    '- `patterns.example.json` — приклад формату мапи критеріїв.',
    '',
    'КРОК 1. Створи поруч з `analyze.py` ЄДИНИЙ новий файл `patterns.json` — JSON-обʼєкт, де КЛЮЧ',
    '— це ТОЧНИЙ рядок критерію зі списку вище, а ЗНАЧЕННЯ — Python-regex для цього критерію.',
    'Пиши regex ЛИШЕ зі своїх мовних знань (НЕ звіряючись з даними). «Приблизно правильно» —',
    'достатньо; движок сам відкидає заперечення й вирізає докази. Правила для regex:',
    '   - альтернація `|` синонімів УКРАЇНСЬКОЮ та РОСІЙСЬКОЮ + типовий сленг;',
    '   - морфологія через стем + `\\w*` (напр. `подряпин\\w*`); `\\b…\\b` для коротких токенів;',
    '   - БЕЗ інлайн `(?i)` (движок компілює з IGNORECASE); заперечення в regex НЕ описувати.',
    '',
    'КРОК 2. Запусти РІВНО ОДИН раз: `python analyze.py` (або `python3 analyze.py`). Движок',
    'прочитає `patterns.json` і всі чанки, створить `output.json`. Якщо команда завершилась без',
    'помилки — ти ЗАКІНЧИВ: напиши один рядок «Готово: output.json» і зупинись.',
    '',
    'СУВОРО ЗАБОРОНЕНО (інакше завдання вважається проваленим):',
    '- створювати БУДЬ-ЯКІ інші файли, крім `patterns.json` (жодних scan/check/find/test/debug',
    '  скриптів, жодних проміжних .py чи .txt-дампів);',
    '- читати/сканувати/грепати `descriptions/*` чи `output.json`; перевіряти або «вдосконалювати»',
    '  патерни; шукати/вичищати хибні спрацьовування; рахувати статистику збігів;',
    '- запускати щось, крім ОДНОГО `python analyze.py`; повторювати запуск після успіху; ітерувати;',
    '- друкувати результат у консоль/відповідь (достатньо файлу `output.json`).',
    '',
    'Якщо `python analyze.py` впав з помилкою — виправ ЛИШЕ `patterns.json` (напр. невалідний',
    'regex) і запусти ще раз; нічого більше не створюй.',
    '',
    '── Fallback (тільки якщо ти НЕ вмієш запускати код): опрацюй чанки напряму й поверни ОДИН',
    'JSON-масив за схемою нижче. Помічних скриптів не пиши.',
    '',
    matchingRulesAndFormat(),
  ].join('\n');
}

/** Приклад вмісту `patterns.json` для ZIP-пакета (формат мапи «критерій → regex»). */
export const PATTERNS_EXAMPLE_JSON = JSON.stringify(
  {
    'розбите скло або тачскрін': 'розбит\\w*\\s+(скло|екран|дисплей)|тріщин\\w*|павутинк\\w*|разбит\\w*\\s+(стекло|экран)|трещин\\w*',
    'наявність сколів': '\\bскол\\w*\\b|збит\\w*\\s+кут\\w*|сбит\\w*\\s+угл\\w*',
    'без торгу': 'без\\s+торг\\w*|торг\\s+відсутн\\w*|остаточн\\w*\\s+цін\\w*|ціна\\s+остаточн\\w*',
  },
  null,
  2,
);

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
