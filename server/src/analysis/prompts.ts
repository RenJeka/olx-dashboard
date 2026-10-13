// Єдине джерело промптів LLM-аналізу — спільне для авто (OpenRouter) і ручного режиму.
// НЕ дублювати тексти промптів деінде.
import type { AnalysisMode, CriterionGroup } from '../types.js';
import {
  BASE_SCAFFOLD,
  CRITERIA_DESC_SLICE,
  DEFAULT_SAMPLE_SIZE,
  MATCHING_DESC_SLICE,
  MAX_CRITERIA,
  MAX_PARAMS_IN_PROMPT,
  MAX_SYNONYMS,
  MODE_NOUN,
  OPPOSITE_MODE,
  SAMPLE_SCORE_LENGTH_CAP,
  SAMPLE_SIGNAL_TOKEN_WEIGHT,
  SIGNAL_TOKENS,
} from './constants.js';
import { stripHtml } from './text.js';
import {
  FORBID_CONSOLE,
  fallbackBlock,
  forbidden,
  packageContents,
  resultLine,
} from './manualZip.js';

/** Оголошення для matching (БЕЗ PII продавця). */
export interface PromptListing {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
}

/**
 * Промпт генерації критеріїв: базовий каркас + доповнення специфічними для категорії
 * на основі семпла описів. Вивід — JSON {"criteria": ["...", ...]}. `existing` — наявні категорії пошуку
 * (з синонімами): модель не повторює й не перефразовує їх (docs/plans/old/criteria-categories.md). `opposite` —
 * категорії протилежного режиму: «не включати» (docs/plans/old/llm-haiku-prompt-audit.md, H1–H2).
 */
export function buildCriteriaPrompt(
  category: string,
  sampleDescriptions: string[],
  mode: AnalysisMode,
  extra?: string,
  existing: CriterionGroup[] = [],
  opposite: CriterionGroup[] = [],
): string {
  const scaffold = BASE_SCAFFOLD[mode].map((c) => `- ${c}`).join('\n');
  const samples = sampleDescriptions
    .map((d, i) => `[${i + 1}] ${stripHtml(d).slice(0, CRITERIA_DESC_SLICE)}`)
    .join('\n\n');

  return [
    `Ти — асистент для аналізу оголошень OLX. Категорія пошуку: "${category}".`,
    `Завдання: скласти список коротких КРИТЕРІЇВ, що описують ${MODE_NOUN[mode]}, ` +
      `за якими далі шукатимуть збіги в описах оголошень.`,
    POLARITY_RULES[mode],
    '',
    'Базовий каркас (обовʼязково включити доречні з них):',
    scaffold,
    '',
    'Доповни список специфічними критеріями для цієї категорії на основі прикладів описів нижче.',
    'Приклади описів оголошень:',
    samples || '(описів недостатньо — спирайся на категорію та базовий каркас)',
    extra ? `\nДодаткові побажання користувача: ${extra}` : '',
    existing.length > 0
      ? '\nУже є критерії (НЕ повторюй їх і НЕ перефразовуй — лише нові, іншого змісту):\n' +
        existing.map((g) => `- ${criterionLabel(g)}`).join('\n')
      : '',
    opposite.length > 0
      ? `\nЦе ${MODE_NOUN[OPPOSITE_MODE[mode]]} — НЕ включай їх і їхні перефразування:\n` +
        opposite.map((g) => `- ${criterionLabel(g)}`).join('\n')
      : '',
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

/**
 * Промпт автогрупування критеріїв (docs/plans/old/criteria-auto-group.md): модель лише називає АСПЕКТ товару
 * для кожного критерію, групи складає код (parseGroupSuggestions: однаковий аспект → категорія). Пряме «згрупуй»
 * порушувало навіть явні заборони (замір — docs/plans/old/llm-haiku-prompt-audit.md). Вхід — лише назви критеріїв із
 * синонімами (без описів оголошень і PII). Вивід — JSON {"items": [{"criterion", "aspect"}]}.
 */
export function buildGroupingPrompt(category: string, groups: CriterionGroup[], mode: AnalysisMode): string {
  return [
    `Ти — асистент для аналізу оголошень OLX. Категорія пошуку: "${category}".`,
    `Нижче — критерії, що описують ${MODE_NOUN[mode]}.`,
    'Завдання: для КОЖНОГО критерію назви аспект товару, якого він стосується, — 1–3 слова, іменник.',
    '',
    'Критерії («сюди ж» — уже обʼєднані з ним формулювання):',
    groups.map((g) => `- ${criterionLabel(g)}`).join('\n'),
    '',
    'Правила:',
    '- Аспект — найконкретніша властивість чи частина товару, про яку критерій (товар може бути будь-якої категорії):',
    '  «комплектація», «загальний стан», «працездатність», «документи», «гарантія», «історія ремонтів», «ціна», «доставка»,',
    '  а також конкретні частини й характеристики саме цього товару (корпус, екран, оббивка, кузов, двигун, тканина,',
    '  розмір, колір, обсяг памʼяті, пробіг тощо).',
    '- Окремі випадки однієї властивості — той самий аспект: «без коробки», «без зарядного пристрою», «лише сам товар»',
    '  → «комплектація»; «подряпини на корпусі», «вмʼятини», «сколи» → «корпус»; «плями на оббивці», «потерта оббивка»',
    '  → «оббивка»; «ржавчина на кузові», «вмʼятина на дверях» → «кузов».',
    '- Різні характеристики й різні частини — різні аспекти: «16 Гб памʼяті» і «512 Гб диску», «розмір M» і «чорний колір»,',
    '  «пробіг 100 тис. км» і «2015 рік»; «ідеальний стан» → «загальний стан», а «екран без пошкоджень» → «екран».',
    '- Якщо критерій протилежний за змістом іншим критеріям того самого аспекту (напр. «є гарантія» і «без гарантії»),',
    '  допиши до його аспекту « (протилежне)».',
    '- Однакові аспекти пиши ОДНАКОВО (той самий текст).',
    '- criterion — ТОЧНА назва критерію зі списку (текст до дужок).',
    '',
    'Формат відповіді — СУВОРО валідний JSON без тексту навколо:',
    '{"items": [{"criterion": "критерій 1", "aspect": "аспект"}]}',
  ].join('\n');
}

/**
 * Промпт генерації синонімів пошукового запиту (docs/plans/search-synonyms.md): альтернативні
 * назви того самого товару на OLX (різні продавці називають по-різному). Вивід —
 * JSON {"synonyms": ["...", ...]}.
 */
export function buildSynonymsPrompt(query: string): string {
  return [
    `Ти — асистент для пошуку оголошень на OLX.ua. Користувач шукає товар за запитом: "${query}".`,
    'Завдання: склади список АЛЬТЕРНАТИВНИХ пошукових запитів (синонімів) для ТОГО САМОГО товару —',
    'продавці на OLX часто називають один і той самий товар по-різному.',
    '',
    'Враховуй:',
    '- різні українські та російські назви/транслітерації одного товару;',
    '- розмовний сленг і скорочення, поширені на OLX;',
    '- альтернативні написання (разом/окремо, з дефісом), часті помилки набору.',
    '',
    'Правила:',
    `- Поверни не більше ${MAX_SYNONYMS} варіантів.`,
    '- Кожен варіант — короткий пошуковий запит (як його ввели б у пошук OLX), без пояснень.',
    '- Без дублікатів і без варіанту, що дослівно повторює вихідний запит.',
    '',
    'Формат відповіді — СУВОРО валідний JSON без тексту навколо:',
    '{"synonyms": ["варіант 1", "варіант 2"]}',
  ].join('\n');
}

/** Оголошення для одного файлу `descriptions/chunk-NNN.json` ZIP-пакета (без PII). */
export interface ChunkListing {
  id: number;
  title: string | null;
  characteristics: string;
  description: string;
}

/** Визначення полярності режиму для генерації критеріїв: описи здебільшого хвалять товар, тож мінуси потребують
 *  явної заборони переваг (замір «до» — docs/plans/old/llm-haiku-prompt-audit.md). */
const POLARITY_RULES: Record<AnalysisMode, string> = {
  cons: [
    'Мінус — те, що робить товар гіршим чи ризикованішим для покупця: дефект, знос, несправність, неповний комплект,',
    'відсутні документи, умови продажу на шкоду покупцю. Переваги — НЕ мінуси, навіть якщо в описах їх більшість:',
    '«повна комплектація», «ідеальний стан», «як новий», «є документи», «без пошкоджень» сюди НЕ включай.',
  ].join('\n'),
  pros: [
    'Плюс — те, що робить товар кращим чи вигіднішим для покупця: хороший стан, повний комплект, документи, гарантія,',
    'вигідні умови. Недоліки — НЕ плюси: «є подряпини», «не працює», «плями», «без комплекту», «на запчастини»',
    'сюди НЕ включай.',
  ].join('\n'),
};

/** Категорія з синонімами для промпту: `дефект екрану (сюди ж: тріснутий екран, зламаний екран)`. */
function criterionLabel(g: CriterionGroup): string {
  return g.aliases.length > 0 ? `${g.name} (сюди ж: ${g.aliases.join(', ')})` : g.name;
}

/** Роль + завдання + список дозволених критеріїв (спільне для matching-промптів). */
function matchingRoleAndCriteria(groups: CriterionGroup[], mode: AnalysisMode): string {
  const criteriaList = groups.map((g, i) => `${i + 1}. ${criterionLabel(g)}`).join('\n');
  const hasAliases = groups.some((g) => g.aliases.length > 0);
  return [
    `Ти — асистент для аналізу оголошень OLX. Знайди ${MODE_NOUN[mode]} у кожному оголошенні.`,
    '',
    'Список дозволених критеріїв (criterion МАЄ бути рівно назвою одного з них — текстом до дужок):',
    criteriaList,
    hasAliases ? '«Сюди ж» — приклади формулювань, що належать до цього критерію; у criterion їх не пиши.' : '',
  ]
    .filter(Boolean)
    .join('\n');
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
  groups: CriterionGroup[],
  listings: PromptListing[],
  mode: AnalysisMode,
): string {
  const items = listings.map(buildListingBlock).join('\n\n');

  return [
    matchingRoleAndCriteria(groups, mode),
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
export function buildManualZipInstructions(groups: CriterionGroup[], mode: AnalysisMode): string {
  return [
    matchingRoleAndCriteria(groups, mode),
    '',
    'Це МЕХАНІЧНЕ завдання на 2 кроки, А НЕ дослідницька задача. Виконай рівно два кроки нижче',
    'й зупинись. Не аналізуй датасет, не оптимізуй точність — це робить готовий движок.',
    '',
    packageContents([
      '`analyze.py` — ГОТОВИЙ детермінований движок (Python, лише стандартна бібліотека). НЕ ' +
        'переписувати, НЕ редагувати, НЕ копіювати його логіку в інший файл.',
      '`descriptions/chunk-NNN.json` — вхідні оголошення (їх читає САМ движок; тобі читати НЕ треба).',
      '`patterns.example.json` — приклад формату мапи критеріїв.',
    ]),
    '',
    'КРОК 1. Створи поруч з `analyze.py` ЄДИНИЙ новий файл `patterns.json` — JSON-обʼєкт, де КЛЮЧ',
    '— це ТОЧНА назва критерію зі списку вище (без дужок «сюди ж»), а ЗНАЧЕННЯ — Python-regex для',
    'цього критерію (формулювання «сюди ж» — теж у regex).',
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
    forbidden([
      'створювати БУДЬ-ЯКІ інші файли, крім `patterns.json` (жодних scan/check/find/test/debug ' +
        'скриптів, жодних проміжних .py чи .txt-дампів);',
      'читати/сканувати/грепати `descriptions/*` чи `output.json`; перевіряти або «вдосконалювати» ' +
        'патерни; шукати/вичищати хибні спрацьовування; рахувати статистику збігів;',
      'запускати щось, крім ОДНОГО `python analyze.py`; повторювати запуск після успіху; ітерувати;',
      `${FORBID_CONSOLE}.`,
    ]),
    '',
    'Якщо `python analyze.py` впав з помилкою — виправ ЛИШЕ `patterns.json` (напр. невалідний',
    'regex) і запусти ще раз; нічого більше не створюй.',
    '',
    resultLine('коли `python analyze.py` завершився без помилки'),
    '',
    fallbackBlock(
      'якщо ти НЕ вмієш запускати код',
      'опрацюй чанки напряму й поверни ОДИН JSON-масив за схемою нижче. Помічних скриптів не пиши.',
    ),
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
