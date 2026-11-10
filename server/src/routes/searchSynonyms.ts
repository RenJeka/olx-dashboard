// Генерація синонімів пошукового запиту (docs/plans/old/search-synonyms.md). Stateless — НЕ
// прив'язано до searchId, бо має працювати ще ДО збереження пошуку (форма створення).
import type { FastifyInstance } from 'fastify';
import { ANALYSIS_ERRORS, DEFAULT_MODEL } from '../analysis/constants.js';
import { requireApiKey } from '../analysis/guards.js';
import { chat } from '../analysis/openrouter.js';
import { parseSynonymsResponse } from '../analysis/parse.js';
import { buildSynonymsPrompt } from '../analysis/prompts.js';
import { BadRequestError, errorMessage } from '../errors.js';

/** Запит із тіла без зайвих пробілів; порожній → 400. */
function requireQuery(raw?: string): string {
  const query = (raw ?? '').trim();
  if (!query) throw new BadRequestError(ANALYSIS_ERRORS.EMPTY_QUERY);
  return query;
}

export async function searchSynonymsRoutes(app: FastifyInstance): Promise<void> {
  // Готовий промпт (ручний режим) — текст для копіювання.
  app.post<{ Body: { query?: string } }>('/api/search-synonyms/prompt', async (req) => {
    return { prompt: buildSynonymsPrompt(requireQuery(req.body.query)) };
  });

  // Авто-генерація (OpenRouter). Без ключа → 409.
  app.post<{ Body: { query?: string; model?: string } }>(
    '/api/search-synonyms/generate',
    async (req, reply) => {
      const query = requireQuery(req.body.query);
      requireApiKey();

      try {
        const raw = await chat([{ role: 'user', content: buildSynonymsPrompt(query) }], {
          model: req.body.model ?? DEFAULT_MODEL,
        });
        return { synonyms: parseSynonymsResponse(raw) };
      } catch (err) {
        return reply.code(502).send({ error: errorMessage(err) });
      }
    },
  );

  // Парс вставленої відповіді LLM з синонімами (ручний). НЕ зберігає.
  app.post<{ Body: { raw?: string } }>('/api/search-synonyms/import', async (req, reply) => {
    if (!req.body.raw) throw new BadRequestError(ANALYSIS_ERRORS.EMPTY_RESPONSE);
    try {
      return { synonyms: parseSynonymsResponse(req.body.raw) };
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }
  });
}
