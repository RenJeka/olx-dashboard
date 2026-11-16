// Передумови AI-запитів: кожна або повертає перевірене значення, або кидає `HttpError` з готовим текстом
// (глобальний обробник відповідає `{ error }` з її кодом). Не знають, який крок AI їх викликає.
import { getSearch, type SearchRow } from '../db/repos/analysis.js';
import { BadRequestError, ConflictError, NotFoundError } from '../errors.js';
import type { AnalysisMode } from '../types.js';
import { hasApiKey } from './config.js';
import { ANALYSIS_ERRORS, isMode } from './constants.js';

/** Пошук за id або 404. */
export async function requireSearch(id: number): Promise<SearchRow> {
  const search = await getSearch(id);
  if (!search) throw new NotFoundError(ANALYSIS_ERRORS.SEARCH_NOT_FOUND);
  return search;
}

/** Авто-режим потребує ключа OpenRouter — без нього 409. */
export function requireApiKey(): void {
  if (!hasApiKey()) throw new ConflictError(ANALYSIS_ERRORS.NO_API_KEY);
}

/** Режим `cons|pros` із запиту або 400. */
export function requireMode(raw: unknown): AnalysisMode {
  if (!isMode(raw)) throw new BadRequestError(ANALYSIS_ERRORS.BAD_MODE);
  return raw;
}
