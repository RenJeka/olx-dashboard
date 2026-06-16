import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../../analysis/config.js';
import {
  ANALYSIS_ERRORS,
  DEFAULT_MODEL,
  DEFAULT_SAMPLE_SIZE,
  isMode,
} from '../../analysis/constants.js';
import { chat } from '../../analysis/openrouter.js';
import { parseCriteriaResponse } from '../../analysis/parse.js';
import { buildCriteriaPrompt, pickSample } from '../../analysis/prompts.js';
import { getSearch, getSavedCriteria, loadListings } from '../../analysis/repo.js';
import { db } from '../../db/db.js';

export async function criteriaRoutes(app: FastifyInstance): Promise<void> {
  // Збережені критерії пошуку.
  app.get<{ Params: { id: string } }>('/api/searches/:id/criteria', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    return getSavedCriteria(id);
  });

  // Генерація критеріїв (авто). Без ключа → 409.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; sampleSize?: number; model?: string; reasoning?: boolean; extra?: string };
  }>('/api/searches/:id/criteria/generate', async (req, reply) => {
    const id = Number(req.params.id);
    const search = getSearch(id);
    if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    if (!hasApiKey()) {
      return reply.code(409).send({ error: ANALYSIS_ERRORS.NO_API_KEY });
    }

    const listings = loadListings(id, []);
    const sample = pickSample(listings, req.body.sampleSize ?? DEFAULT_SAMPLE_SIZE);
    const prompt = buildCriteriaPrompt(
      search.name,
      sample.map((l) => l.description ?? ''),
      req.body.mode,
      req.body.extra,
    );

    try {
      const raw = await chat([{ role: 'user', content: prompt }], {
        model: req.body.model ?? DEFAULT_MODEL,
        reasoning: req.body.reasoning,
      });
      return { criteria: parseCriteriaResponse(raw) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: message });
    }
  });

  // Промпт генерації критеріїв (ручний) — готовий текст для копіювання.
  app.get<{ Params: { id: string }; Querystring: { mode?: string; extra?: string } }>(
    '/api/searches/:id/criteria/prompt',
    async (req, reply) => {
      const id = Number(req.params.id);
      const search = getSearch(id);
      if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!isMode(req.query.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });

      const listings = loadListings(id, []);
      const sample = pickSample(listings, DEFAULT_SAMPLE_SIZE);
      const prompt = buildCriteriaPrompt(
        search.name,
        sample.map((l) => l.description ?? ''),
        req.query.mode,
        req.query.extra,
      );
      return { prompt };
    },
  );

  // Парс вставленої відповіді LLM з критеріями (ручний). НЕ зберігає.
  app.post<{ Params: { id: string }; Body: { mode?: string; raw?: string } }>(
    '/api/searches/:id/criteria/import',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!req.body.raw) return reply.code(400).send({ error: ANALYSIS_ERRORS.EMPTY_RESPONSE });
      try {
        return { criteria: parseCriteriaResponse(req.body.raw) };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // Зберегти обрані критерії пошуку.
  app.put<{ Params: { id: string }; Body: { cons?: string[]; pros?: string[] } }>(
    '/api/searches/:id/criteria',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });

      const current = getSavedCriteria(id);
      const next = {
        cons: Array.isArray(req.body.cons) ? req.body.cons : current.cons,
        pros: Array.isArray(req.body.pros) ? req.body.pros : current.pros,
      };
      db.prepare('UPDATE searches SET analysis_criteria = ? WHERE id = ?').run(JSON.stringify(next), id);
      return next;
    },
  );
}
