// Генерація синонімів пошукового запиту (docs/plans/search-synonyms.md). Stateless — НЕ
// прив'язано до searchId, бо має працювати ще ДО збереження пошуку (форма створення).
import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../analysis/config.js';
import { DEFAULT_MODEL } from '../analysis/constants.js';
import { chat } from '../analysis/openrouter.js';
import { parseSynonymsResponse } from '../analysis/parse.js';
import { buildSynonymsPrompt } from '../analysis/prompts.js';

const NO_API_KEY = 'Авто-режим недоступний: немає OPENROUTER_API_KEY';
const EMPTY_QUERY = 'Поле query обовʼязкове';
const EMPTY_RESPONSE = 'Порожня відповідь';

export async function searchSynonymsRoutes(app: FastifyInstance): Promise<void> {
  // Готовий промпт (ручний режим) — текст для копіювання.
  app.post<{ Body: { query?: string } }>('/api/search-synonyms/prompt', async (req, reply) => {
    const query = (req.body.query ?? '').trim();
    if (!query) return reply.code(400).send({ error: EMPTY_QUERY });
    return { prompt: buildSynonymsPrompt(query) };
  });

  // Авто-генерація (OpenRouter). Без ключа → 409.
  app.post<{ Body: { query?: string; model?: string } }>(
    '/api/search-synonyms/generate',
    async (req, reply) => {
      const query = (req.body.query ?? '').trim();
      if (!query) return reply.code(400).send({ error: EMPTY_QUERY });
      if (!hasApiKey()) return reply.code(409).send({ error: NO_API_KEY });

      try {
        const raw = await chat([{ role: 'user', content: buildSynonymsPrompt(query) }], {
          model: req.body.model ?? DEFAULT_MODEL,
        });
        return { synonyms: parseSynonymsResponse(raw) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(502).send({ error: message });
      }
    },
  );

  // Парс вставленої відповіді LLM з синонімами (ручний). НЕ зберігає.
  app.post<{ Body: { raw?: string } }>('/api/search-synonyms/import', async (req, reply) => {
    if (!req.body.raw) return reply.code(400).send({ error: EMPTY_RESPONSE });
    try {
      return { synonyms: parseSynonymsResponse(req.body.raw) };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
