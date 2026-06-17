import type { PickCandidate, PickItem, PickResult } from '../types.js';
import { DEFAULT_MODEL } from './constants.js';
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

export function buildPickPrompt(candidates: PickCandidate[]): string {
  const items = candidates.map((c) => ({
    id: c.id,
    title: c.title ?? '',
    price: c.price ?? null,
    city: c.city ?? '',
    params: formatParams(c.params),
    description: truncate(c.description, MAX_DESC_CHARS),
    pros: truncate(c.pros, MAX_PROS_CHARS),
  }));

  return `Ти — AI-помічник для вибору найкращого оголошення про покупку.
Тобі надається список оголошень без явних мінусів.
Твоє завдання — ВИБРАТИ 3–5 НАЙКРАЩИХ кандидатів і пояснити чому.
Відкидай решту. Якщо жоден не відповідає критеріям якості — можеш повернути порожній масив.

Критерії відбору (за пріоритетом):
1. Повний опис, вказані характеристики, ознаки реального продавця
2. Адекватна ціна відносно інших у списку
3. Вказані плюси (поле pros)
4. Місто та наявність фото (photo)

Поверни відповідь СТРОГО у форматі JSON (без markdown):
{
  "picks": [
    {"id": <число>, "rank": 1, "reason": "<коротке пояснення чому обрано>"},
    ...
  ],
  "summary": "<загальний висновок 1–2 речення>"
}

Оголошення для аналізу (${candidates.length} шт.):
${JSON.stringify(items, null, 2)}`;
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
    picks,
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
