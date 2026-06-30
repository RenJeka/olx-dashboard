import { ZipArchive } from 'archiver';
import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../analysis/config.js';
import {
  buildPickManualZipInstructions,
  buildPickPrompt,
  parsePickResponse,
  runAiPicks,
  toPickItems,
} from '../analysis/aiPicks.js';
import {
  JSON_EXPORT_INDENT,
  MANUAL_PICKS_ZIP_CHUNK_SIZE,
  MIME_ZIP,
  PICK_TOP_N,
  PICKS_NOMINEES_PER_CHUNK,
} from '../analysis/constants.js';
import { chunk } from '../analysis/promptData.js';
import { loadPickCandidates, getSearch } from '../analysis/repo.js';
import { db } from '../db/db.js';
import type { PickItem, PickResult } from '../types.js';

const SEARCH_NOT_FOUND = 'Пошук не знайдено';
const NO_CANDIDATES = 'Немає кандидатів для ранжування (додайте оголошення без мінусів)';
const EMPTY_RESPONSE = 'Порожня відповідь';
const NO_API_KEY = 'Авто-режим недоступний: немає OPENROUTER_API_KEY';

export async function aiPicksRoutes(app: FastifyInstance): Promise<void> {
  // Готовий промпт для ручного режиму. POST, щоб нести `ids` обраного обсягу
  // (порожній/відсутній → дефолтний пул кандидатів).
  app.post<{ Params: { id: string }; Body: { ids?: number[] } }>(
    '/api/searches/:id/ai-picks/prompt',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!(await getSearch(id))) return reply.code(404).send({ error: SEARCH_NOT_FOUND });

      const candidates = await loadPickCandidates(id, req.body.ids);
      if (candidates.length === 0) return reply.code(400).send({ error: NO_CANDIDATES });

      const prompt = buildPickPrompt(candidates);
      return { prompt };
    },
  );

  // ZIP-пакет ручного режиму для великих пулів кандидатів: prompt.txt (2-етапні
  // map-reduce інструкції) + candidates/chunk-NNN.json. На відміну від matching
  // тут немає детерміністичного скрипта — відбір завжди робить LLM/агент.
  // POST, щоб нести `ids` обраного обсягу.
  app.post<{ Params: { id: string }; Body: { ids?: number[] } }>(
    '/api/searches/:id/ai-picks/package.zip',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!(await getSearch(id))) return reply.code(404).send({ error: SEARCH_NOT_FOUND });

      const candidates = await loadPickCandidates(id, req.body.ids);
      if (candidates.length === 0) return reply.code(400).send({ error: NO_CANDIDATES });

      const chunks = chunk(candidates, MANUAL_PICKS_ZIP_CHUNK_SIZE);

      const archive = new ZipArchive();
      archive.on('error', (err: Error) => req.log.error(err));

      archive.append(
        buildPickManualZipInstructions(candidates.length, chunks.length, PICKS_NOMINEES_PER_CHUNK, PICK_TOP_N),
        { name: 'prompt.txt' },
      );
      chunks.forEach((group, idx) => {
        const name = `candidates/chunk-${String(idx + 1).padStart(3, '0')}.json`;
        archive.append(JSON.stringify(toPickItems(group), null, JSON_EXPORT_INDENT), { name });
      });
      void archive.finalize();

      reply.header('Content-Disposition', `attachment; filename="ai-picks-search-${id}.zip"`);
      reply.type(MIME_ZIP);
      return reply.send(archive);
    },
  );

  // Авто-режим: OpenRouter → повертає PickResult, НЕ пише в БД
  app.post<{ Params: { id: string }; Body: { model?: string; ids?: number[] } }>(
    '/api/searches/:id/ai-picks/rank',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!(await getSearch(id))) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
      if (!hasApiKey()) return reply.code(409).send({ error: NO_API_KEY });

      const candidates = await loadPickCandidates(id, req.body.ids);
      if (candidates.length === 0) return reply.code(400).send({ error: NO_CANDIDATES });

      try {
        const result = await runAiPicks(candidates, req.body.model);
        return result satisfies PickResult;
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // Ручний режим: parse вставленої відповіді → PickResult, НЕ пише в БД
  app.post<{ Params: { id: string }; Body: { raw?: string; ids?: number[] } }>(
    '/api/searches/:id/ai-picks/import',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!(await getSearch(id))) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
      if (!req.body.raw) return reply.code(400).send({ error: EMPTY_RESPONSE });

      const candidates = await loadPickCandidates(id, req.body.ids);
      const validIds = candidates.map((c) => c.id);

      try {
        const result = parsePickResponse(req.body.raw, validIds);
        return result satisfies PickResult;
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // Commit: UPDATE ai_rank/ai_pick_reason/ai_ranked_at у транзакції
  // Вибрані отримують rank+reason; всі решта цього пошуку — NULL (скидаємо старі результати)
  app.post<{ Params: { id: string }; Body: { picks?: PickItem[] } }>(
    '/api/searches/:id/ai-picks/commit',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!(await getSearch(id))) return reply.code(404).send({ error: SEARCH_NOT_FOUND });

      const picks = Array.isArray(req.body.picks) ? req.body.picks : [];

      const CLEAR_SQL = `UPDATE listings SET ai_rank = NULL, ai_pick_reason = NULL, ai_ranked_at = NULL
         WHERE search_id = ?`;
      const SET_SQL = `UPDATE listings SET ai_rank = ?, ai_pick_reason = ?, ai_ranked_at = datetime('now')
         WHERE id = ? AND search_id = ?`;

      // Інтерактивна транзакція: скидання старих результатів + запис нових атомарно.
      const tx = await db.transaction('write');
      let committed = 0;
      try {
        await tx.execute({ sql: CLEAR_SQL, args: [id] });
        for (const pick of picks) {
          const info = await tx.execute({ sql: SET_SQL, args: [pick.rank, pick.reason, pick.id, id] });
          committed += info.rowsAffected;
        }
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }

      return { committed };
    },
  );
}
