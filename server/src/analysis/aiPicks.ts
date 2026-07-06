import type { PickCandidate, PickItem, PickResult } from '../types.js';
import { DEFAULT_MODEL, PICK_TOP_N } from './constants.js';
import { chat } from './openrouter.js';
import { hasApiKey } from './config.js';
import {
  FORBID_CONSOLE,
  FORBID_REPROCESS,
  FORBID_RESEARCH,
  fallbackBlock,
  forbidden,
  mechanicalIntro,
  packageContents,
  resultLine,
} from './manualZip.js';

const MAX_PARAMS = 8;
const MAX_DESC_CHARS = 1200;
const MAX_PROS_CHARS = 400;

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function formatParams(params: string | null): string {
  try {
    const obj = JSON.parse(params ?? '{}') as Record<string, unknown>;
    return Object.entries(obj)
      .slice(0, MAX_PARAMS)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('; ');
  } catch {
    return '';
  }
}

/** Серіалізує кандидатів у компактний JSON-вигляд для промпту/ZIP-чанків (без PII продавця). */
export function toPickItems(candidates: PickCandidate[]): unknown[] {
  return candidates.map((c) => ({
    id: c.id,
    title: c.title ?? '',
    price: c.price ?? null,
    city: c.city ?? '',
    params: formatParams(c.params),
    description: truncate(c.description, MAX_DESC_CHARS),
    pros: truncate(c.pros, MAX_PROS_CHARS),
  }));
}

const PICK_RESPONSE_FORMAT = `{
  "picks": [
    {"id": <число>, "rank": 1, "reason": "<коротке пояснення чому обрано>"},
    ...
  ],
  "summary": "<загальний висновок 1–2 речення>"
}`;

const PICK_SELECTION_CRITERIA = `1. Повний опис, вказані характеристики, ознаки реального продавця
2. Адекватна ціна відносно інших у списку
3. Вказані плюси (поле pros)
4. Місто та наявність фото (photo)`;

/** Роль + завдання (спільне для інлайн-промпту авто-режиму й ZIP-інструкції). */
function pickRoleAndTask(topN: number): string {
  return [
    'Ти — AI-помічник для вибору найкращих оголошень про покупку.',
    'Тобі надається список оголошень без явних мінусів.',
    `Твоє завдання — ВИБРАТИ ТОП-${topN} НАЙКРАЩИХ кандидатів і відсортувати їх від`,
    `найкращого (rank=1) до найгіршого (rank=${topN}), коротко пояснивши чому кожен туди потрапив.`,
    `Якщо кандидатів менше ${topN} — повернути всіх, відсортованих за рейтингом.`,
    'Відкидай решту. Якщо жоден не відповідає критеріям якості — можеш повернути порожній масив.',
  ].join('\n');
}

export function buildPickPrompt(candidates: PickCandidate[], topN: number = PICK_TOP_N): string {
  const items = toPickItems(candidates);

  return [
    pickRoleAndTask(topN),
    '',
    'Критерії відбору (за пріоритетом):',
    PICK_SELECTION_CRITERIA,
    '',
    'Поверни відповідь СТРОГО у форматі JSON (без markdown):',
    PICK_RESPONSE_FORMAT,
    '',
    `Оголошення для аналізу (${candidates.length} шт.):`,
    JSON.stringify(items, null, 2),
  ].join('\n');
}

/**
 * Інструкції для ZIP-пакета ручного режиму AI Вибір (`prompt.txt`).
 *
 * На відміну від matching (детерміністичний `analyze.py`) відбір — це СУДЖЕННЯ, тож
 * детермінованого движка тут немає; але МЕХАНІКА уніфікована з кроком AI Фільтр: map-reduce
 * НА ФАЙЛАХ (без скриптів). Map: у ZIP уже лежить ПОРОЖНЯ заготовка `nominations/nominees-NNN.json`
 * на КОЖЕН чанк (роут aiPicks.ts) — слабкій моделі легше ЗАПОВНИТИ наявний файл (гарантована
 * назва/шлях, видно чек-лист), ніж створювати з нуля; проміжні файли переживають втрату
 * контексту. Reduce: агент читає всі nominees-файли й САМ пише `output.json` (reduce — теж
 * судження, скрипт не потрібен). Нічого в консоль — результат лише у файлі (як кроки 1–2).
 * Спільні блоки — з `manualZip.ts`.
 */
export function buildPickManualZipInstructions(
  totalCandidates: number,
  totalChunks: number,
  nomineesPerChunk: number,
  topN: number,
): string {
  return [
    pickRoleAndTask(topN),
    '',
    mechanicalIntro(
      'обрати найкращих кандидатів за критеріями нижче (це судження — детермінованого движка ' +
        'тут немає, тож обирає сам агент, але механіка — жорстко за кроками).',
      { chunked: true },
    ),
    '',
    `У пакеті ${totalCandidates} кандидатів (без мінусів, без PII продавця), розбитих на ${totalChunks} файлів.`,
    packageContents([
      '`candidates/chunk-NNN.json` — вхідні кандидати ({id, title, price, city, params, description, pros}).',
      '`nominations/nominees-NNN.json` — ПОРОЖНІ заготовки (`[]`, по одній на чанк); ти їх заповнюєш.',
    ]),
    '',
    'Критерії відбору (за пріоритетом):',
    PICK_SELECTION_CRITERIA,
    '',
    'КРОК 1 — Номінація (map). У теці `nominations/` уже лежить ПОРОЖНІЙ `nominees-NNN.json` (`[]`)',
    'на КОЖЕН чанк — це ЗАГОТОВКИ, які ти МУСИШ заповнити (не створюй нових). Для КОЖНОГО чанку ОКРЕМО:',
    '   1. Прочитай `candidates/chunk-NNN.json`.',
    `   2. Обери до ${nomineesPerChunk} найкращих кандидатів ЦЬОГО чанку за критеріями вище.`,
    '   3. ЗАПОВНИ парний `nominations/nominees-NNN.json` (ТОЙ САМИЙ номер NNN) — заміни `[]` на',
    '      РІВНО валідний JSON-масив [{"id": <число>, "reason": "<коротко чому>"}], без markdown',
    '      і тексту навколо. Нічого не виводь у консоль. Файл, що лишився `[]`, = чанк НЕ опрацьовано.',
    '   4. Перейди до наступного чанку. Обробляй по одному — так не впираєшся в ліміт довжини',
    '      відповіді й не тримаєш усе в памʼяті.',
    '',
    `КРОК 2 — Фінальний відбір (reduce, ЛИШЕ після заповнення УСІХ ${totalChunks} nominees-файлів):`,
    '   1. Самоперевірка: жоден `nominations/nominees-NNN.json` не лишився `[]` через пропуск',
    '      (порожній припустимий ЛИШЕ якщо в чанку справді немає гідних кандидатів).',
    '   2. Прочитай ВСІ файли `nominations/nominees-*.json`.',
    `   3. Серед усіх номінантів обери й відсортуй фінальний ТОП-${topN} (rank=1 — найкращий).`,
    `      Якщо номінантів менше ${topN} — візьми всіх.`,
    '   4. Запиши результат у `output.json` РІВНО за схемою нижче. Нічого не виводь у консоль.',
    '',
    forbidden([
      'створювати будь-які НОВІ файли/теки/скрипти — ти ЛИШЕ заповнюєш наявні ' +
        '`nominations/nominees-NNN.json` і пишеш `output.json` (жодних scan/check/helper-скриптів, ' +
        '.txt-дампів, «brain»-нотаток);',
      `${FORBID_RESEARCH};`,
      `${FORBID_REPROCESS};`,
      `${FORBID_CONSOLE}.`,
    ]),
    '',
    resultLine('коли фінальний топ записано'),
    '',
    fallbackBlock(
      'якщо ти НЕ можеш читати/писати файли',
      'опрацюй усі чанки за один прохід (номінація в памʼяті → фінальний топ) і поверни ОДИН ' +
        'JSON за схемою нижче. Помічних файлів/скриптів не створюй.',
    ),
    '',
    'Формат `output.json` (і відповіді у fallback) — СТРОГО валідний JSON без markdown:',
    PICK_RESPONSE_FORMAT,
  ].join('\n');
}

export function parsePickResponse(raw: string, validIds: number[]): PickResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Не вдалось розпарсити відповідь AI: ${raw.slice(0, 200)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const picksRaw = Array.isArray(obj.picks) ? obj.picks : [];
  const validIdSet = new Set(validIds);

  const picks: PickItem[] = [];
  for (const item of picksRaw) {
    const p = item as Record<string, unknown>;
    const id = Number(p.id);
    const rank = Number(p.rank);
    const reason = String(p.reason ?? '');
    if (!Number.isFinite(id) || !validIdSet.has(id)) continue;
    if (!Number.isFinite(rank) || rank < 1) continue;
    picks.push({ id, rank, reason });
  }

  picks.sort((a, b) => a.rank - b.rank);

  return {
    picks: picks.slice(0, PICK_TOP_N),
    summary: String(obj.summary ?? ''),
  };
}

export async function runAiPicks(
  candidates: PickCandidate[],
  model?: string,
): Promise<PickResult> {
  if (!hasApiKey()) {
    throw new Error('Авто-режим недоступний: немає OPENROUTER_API_KEY');
  }
  const prompt = buildPickPrompt(candidates);
  const validIds = candidates.map((c) => c.id);
  const raw = await chat([{ role: 'user', content: prompt }], {
    model: model ?? DEFAULT_MODEL,
  });
  return parsePickResponse(raw, validIds);
}
