import type { FastifyInstance } from 'fastify';
import {
  buildPickManualZipInstructions,
  buildPickPrompt,
  parsePickResponse,
  runAiPicks,
  toPickItems,
} from '../analysis/aiPicks.js';
import {
  ANALYSIS_ERRORS,
  JSON_EXPORT_INDENT,
  PICK_CANDIDATES_LIMIT,
  MANUAL_PICKS_ZIP_CHUNK_SIZE,
  PICK_TOP_N,
  PICKS_NOMINEES_PER_CHUNK,
} from '../analysis/constants.js';
import { requireApiKey, requireSearch } from '../analysis/guards.js';
import { ZIP_EMPTY_RESULT, ZIP_FILES, numberedFile } from '../analysis/manualZip.js';
import { chunk } from '../analysis/promptData.js';
import { commitAiPicks, loadPickCandidates } from '../db/repos/analysis.js';
import { BadRequestError, errorMessage } from '../errors.js';
import type { PickCandidate, PickItem, PickResult } from '../types.js';
import { sendZip, type ZipEntry } from './http.js';

/** Пул кандидатів обраного обсягу; порожній → 400. */
async function requireCandidates(searchId: number, ids?: number[]): Promise<PickCandidate[]> {
  const candidates = await loadPickCandidates(searchId, PICK_CANDIDATES_LIMIT, ids);
  if (candidates.length === 0) throw new BadRequestError(ANALYSIS_ERRORS.NO_CANDIDATES);
  return candidates;
}

export async function aiPicksRoutes(app: FastifyInstance): Promise<void> {
  // Готовий промпт для ручного режиму. POST, щоб нести `ids` обраного обсягу
  // (порожній/відсутній → дефолтний пул кандидатів).
  app.post<{ Params: { id: string }; Body: { ids?: number[] } }>(
    '/api/searches/:id/ai-picks/prompt',
    async (req) => {
      const { id } = await requireSearch(Number(req.params.id));
      return { prompt: buildPickPrompt(await requireCandidates(id, req.body.ids)) };
    },
  );

  // ZIP-пакет ручного режиму для великих пулів кандидатів: prompt.txt (2-етапні
  // map-reduce інструкції) + candidates/chunk-NNN.json. На відміну від matching
  // тут немає детерміністичного скрипта — відбір завжди робить LLM/агент.
  // POST, щоб нести `ids` обраного обсягу.
  app.post<{ Params: { id: string }; Body: { ids?: number[] } }>(
    '/api/searches/:id/ai-picks/package.zip',
    async (req, reply) => {
      const { id } = await requireSearch(Number(req.params.id));
      const candidates = await requireCandidates(id, req.body.ids);
      const chunks = chunk(candidates, MANUAL_PICKS_ZIP_CHUNK_SIZE);

      const entries: ZipEntry[] = [
        {
          name: ZIP_FILES.PROMPT,
          content: buildPickManualZipInstructions(candidates.length, chunks.length, PICKS_NOMINEES_PER_CHUNK, PICK_TOP_N),
        },
      ];
      chunks.forEach((group, idx) => {
        entries.push({
          name: numberedFile(ZIP_FILES.CANDIDATES, idx),
          content: JSON.stringify(toPickItems(group), null, JSON_EXPORT_INDENT),
        });
        // Порожня заготовка проміжного файлу-номінантів на КОЖЕН чанк: слабкій моделі легше
        // заповнити наявний файл (гарантована назва/шлях, видно чек-лист), ніж створювати з нуля.
        entries.push({ name: numberedFile(ZIP_FILES.NOMINEES, idx), content: ZIP_EMPTY_RESULT });
      });
      return sendZip(req, reply, `ai-picks-search-${id}.zip`, entries);
    },
  );

  // Авто-режим: OpenRouter → повертає PickResult, НЕ пише в БД
  app.post<{ Params: { id: string }; Body: { model?: string; ids?: number[] } }>(
    '/api/searches/:id/ai-picks/rank',
    async (req, reply) => {
      const { id } = await requireSearch(Number(req.params.id));
      requireApiKey();
      const candidates = await requireCandidates(id, req.body.ids);

      try {
        const result = await runAiPicks(candidates, req.body.model);
        return result satisfies PickResult;
      } catch (err) {
        return reply.code(500).send({ error: errorMessage(err) });
      }
    },
  );

  // Ручний режим: parse вставленої відповіді → PickResult, НЕ пише в БД
  app.post<{ Params: { id: string }; Body: { raw?: string; ids?: number[] } }>(
    '/api/searches/:id/ai-picks/import',
    async (req, reply) => {
      const { id } = await requireSearch(Number(req.params.id));
      if (!req.body.raw) throw new BadRequestError(ANALYSIS_ERRORS.EMPTY_RESPONSE);

      const candidates = await loadPickCandidates(id, PICK_CANDIDATES_LIMIT, req.body.ids);
      const validIds = candidates.map((c) => c.id);

      try {
        const result = parsePickResponse(req.body.raw, validIds);
        return result satisfies PickResult;
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    },
  );

  // Commit: UPDATE ai_rank/ai_pick_reason/ai_ranked_at у транзакції
  // Вибрані отримують rank+reason; всі решта цього пошуку — NULL (скидаємо старі результати)
  app.post<{ Params: { id: string }; Body: { picks?: PickItem[] } }>(
    '/api/searches/:id/ai-picks/commit',
    async (req) => {
      const { id } = await requireSearch(Number(req.params.id));

      const picks = Array.isArray(req.body.picks) ? req.body.picks : [];

      // Скидання старих результатів + запис нових — атомарно (транзакція в репозиторії).
      return { committed: await commitAiPicks(id, picks) };
    },
  );
}
