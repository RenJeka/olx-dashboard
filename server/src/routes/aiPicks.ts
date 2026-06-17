import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../analysis/config.js';
import { buildPickPrompt, parsePickResponse, runAiPicks } from '../analysis/aiPicks.js';
import { loadPickCandidates, getSearch } from '../analysis/repo.js';
import { db } from '../db/db.js';
import type { PickItem, PickResult } from '../types.js';

const SEARCH_NOT_FOUND = 'Пошук не знайдено';
const NO_CANDIDATES = 'Немає кандидатів для ранжування (додайте оголошення без мінусів)';
const EMPTY_RESPONSE = 'Порожня відповідь';
const NO_API_KEY = 'Авто-режим недоступний: немає OPENROUTER_API_KEY';

export async function aiPicksRoutes(app: FastifyInstance): Promise<void> {
  // Готовий промпт для ручного режиму
  app.get<{ Params: { id: string } }>(
    '/api/searches/:id/ai-picks/prompt',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });

      const candidates = loadPickCandidates(id);
      if (candidates.length === 0) return reply.code(400).send({ error: NO_CANDIDATES });

      const prompt = buildPickPrompt(candidates);
      return { prompt };
    },
  );

  // Авто-режим: OpenRouter → повертає PickResult, НЕ пише в БД
  app.post<{ Params: { id: string }; Body: { model?: string } }>(
    '/api/searches/:id/ai-picks/rank',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
      if (!hasApiKey()) return reply.code(409).send({ error: NO_API_KEY });

      const candidates = loadPickCandidates(id);
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
  app.post<{ Params: { id: string }; Body: { raw?: string } }>(
    '/api/searches/:id/ai-picks/import',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
      if (!req.body.raw) return reply.code(400).send({ error: EMPTY_RESPONSE });

      const candidates = loadPickCandidates(id);
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
      if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });

      const picks = Array.isArray(req.body.picks) ? req.body.picks : [];

      const clearStmt = db.prepare(
        `UPDATE listings SET ai_rank = NULL, ai_pick_reason = NULL, ai_ranked_at = NULL
         WHERE search_id = ?`,
      );
      const setStmt = db.prepare(
        `UPDATE listings SET ai_rank = ?, ai_pick_reason = ?, ai_ranked_at = datetime('now')
         WHERE id = ? AND search_id = ?`,
      );

      const run = db.transaction(() => {
        clearStmt.run(id);
        let committed = 0;
        for (const pick of picks) {
          const info = setStmt.run(pick.rank, pick.reason, pick.id, id);
          committed += info.changes;
        }
        return committed;
      });

      const committed = run();
      return { committed };
    },
  );
}
