import type { PickCandidate, PickItem, PickResult } from '../types.js';
import { DEFAULT_MODEL, PICK_TOP_N } from './constants.js';
import { chat } from './openrouter.js';
import { hasApiKey } from './config.js';

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

export function buildPickPrompt(candidates: PickCandidate[], topN: number = PICK_TOP_N): string {
  const items = toPickItems(candidates);

  return `Ти — AI-помічник для вибору найкращих оголошень про покупку.
Тобі надається список оголошень без явних мінусів.
Твоє завдання — ВИБРАТИ ТОП-${topN} НАЙКРАЩИХ кандидатів і відсортувати їх від
найкращого (rank=1) до найгіршого (rank=${topN}), коротко пояснивши чому кожен туди потрапив.
Якщо кандидатів менше ${topN} — повернути всіх, відсортованих за рейтингом.
Відкидай решту. Якщо жоден не відповідає критеріям якості — можеш повернути порожній масив.

Критерії відбору (за пріоритетом):
${PICK_SELECTION_CRITERIA}

Поверни відповідь СТРОГО у форматі JSON (без markdown):
${PICK_RESPONSE_FORMAT}

Оголошення для аналізу (${candidates.length} шт.):
${JSON.stringify(items, null, 2)}`;
}

/**
 * Інструкції для ZIP-пакета ручного режиму AI Вибір (`prompt.txt`).
 * На відміну від matching (детерміністичний `analyze.py`), відбір тут — це судження,
 * яке завжди робить LLM/агент: 2-етапний map-reduce (номінація з кожного чанку →
 * фінальний топ із номінантів), щоб не перевищити контекст одним величезним промптом.
 */
export function buildPickManualZipInstructions(
  totalCandidates: number,
  totalChunks: number,
  nomineesPerChunk: number,
  topN: number,
): string {
  return `Завдання у 2 етапи: вибір найкращих оголошень для покупки.

У цьому пакеті ${totalCandidates} кандидатів (без мінусів, без PII продавця), розбитих на
${totalChunks} файлів candidates/chunk-NNN.json.

ЕТАП 1 (для кожного з ${totalChunks} файлів окремо):
Прочитай кандидатів файлу і визнач до ${nomineesPerChunk} найкращих за критеріями:
${PICK_SELECTION_CRITERIA}
Запам'ятай обраних (id + коротке пояснення) — це промiжний результат, нічого не виводь
користувачу на цьому етапі, просто переходь до наступного файлу.

ЕТАП 2 (лише після опрацювання УСІХ ${totalChunks} файлів):
Серед усіх номінантів з усіх файлів обери і відсортуй фінальний ТОП-${topN}
(rank=1 — найкращий). Якщо номінантів менше ${topN} — повернути всіх.

Виведи СТРОГО ОДИН JSON-результат (без markdown, без проміжних кроків етапу 1):
${PICK_RESPONSE_FORMAT}`;
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
