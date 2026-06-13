// Єдине джерело промптів LLM-аналізу — спільне для авто (OpenRouter) і ручного режиму.
// НЕ дублювати тексти промптів деінде.
import type { AnalysisMode } from '../types.js';
import { MAX_CRITERIA } from './config.js';
import { stripHtml } from './text.js';

/** Оголошення для matching (БЕЗ PII продавця). */
export interface PromptListing {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
}

/** Базовий каркас критеріїв — зашитий, LLM доповнює специфічними для категорії. */
const BASE_SCAFFOLD: Record<AnalysisMode, string[]> = {
  cons: [
    'поганий стан',
    'неповна комплектація',
    'на запчастини / не працює',
    'сліди ремонту',
    'уцінка / дефект',
    'без торгу',
    'відсутні документи',
  ],
  pros: [
    'відмінний стан',
    'повна комплектація',
    'на гарантії',
    'документи в наявності',
    'без слідів використання',
    'можливий торг',
    'нове / як нове',
  ],
};

const MODE_NOUN: Record<AnalysisMode, string> = {
  cons: 'мінуси (недоліки) товару',
  pros: 'плюси (переваги) товару',
};

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
    .map((d, i) => `[${i + 1}] ${stripHtml(d).slice(0, 800)}`)
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

/**
 * Промпт matching: для кожного оголошення повернути збіги критеріїв з дослівним evidence.
 * criterion ОБОВʼЯЗКОВО з наданого списку; evidence — дослівно з опису. БЕЗ PII у вході.
 */
export function buildMatchingPrompt(
  criteria: string[],
  listings: PromptListing[],
  mode: AnalysisMode,
): string {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const items = listings
    .map((l) => {
      const params = parseParamsLabel(l.params);
      const desc = stripHtml(l.description).slice(0, 1500) || '(опис відсутній)';
      return [
        `### id: ${l.id}`,
        `Назва: ${l.title ?? '—'}`,
        params ? `Характеристики: ${params}` : '',
        `Опис: ${desc}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    `Ти — асистент для аналізу оголошень OLX. Знайди ${MODE_NOUN[mode]} у кожному оголошенні.`,
    '',
    'Список дозволених критеріїв (criterion МАЄ бути рівно одним із цих рядків):',
    criteriaList,
    '',
    'Оголошення:',
    items,
    '',
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

/** params (JSON {key:label}) → короткий рядок "label1, label2" для промпту. */
function parseParamsLabel(params: string | null): string {
  if (!params) return '';
  try {
    const obj = JSON.parse(params) as Record<string, string>;
    return Object.values(obj).filter(Boolean).slice(0, 12).join(', ');
  } catch {
    return '';
  }
}

/** «Сигнальні» токени — описи з ними інформативніші для генерації критеріїв. */
const SIGNAL_TOKENS = [
  'стан',
  'ремонт',
  'запчастини',
  'не працює',
  'дефект',
  'торг',
  'гарант',
  'комплект',
  'документ',
  'новий',
  'подряпин',
  'тріщин',
];

/**
 * Семпл описів для генерації критеріїв: зважено за довжиною + наявністю сигнальних
 * токенів, топ-k. Вхід — рядки оголошень з description.
 */
export function pickSample<T extends { description: string | null }>(listings: T[], k = 30): T[] {
  const scored = listings
    .filter((l) => l.description)
    .map((l) => {
      const text = stripHtml(l.description).toLowerCase();
      const signalHits = SIGNAL_TOKENS.reduce((acc, tok) => (text.includes(tok) ? acc + 1 : acc), 0);
      const score = Math.min(text.length, 1500) + signalHits * 300;
      return { l, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((s) => s.l);
}
