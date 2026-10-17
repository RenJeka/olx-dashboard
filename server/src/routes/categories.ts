// API дерева категорій OLX і базових наборів (docs/plans/base-criteria.md).
import type { FastifyInstance } from 'fastify';
import { collectCategories } from '../categories/collector.js';
import { SEED_WORDS } from '../categories/seedWords.js';
import { logError } from '../logger.js';

const ALREADY_RUNNING = 'Збір дерева категорій уже йде';

/** Прапорець «збір іде» — in-memory (single-user, один процес). */
let collecting = false;

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  // Синхронний збір дерева за SEED_WORDS (~хвилина через паузи між запитами). Паралельний виклик → 409.
  app.post('/api/categories/collect', async (_req, reply) => {
    if (collecting) return reply.code(409).send({ error: ALREADY_RUNNING });
    collecting = true;
    try {
      return await collectCategories(SEED_WORDS);
    } catch (err) {
      logError('scanner', 'category-collect', err);
      return reply.code(500).send({ error: 'Не вдалося зібрати дерево категорій' });
    } finally {
      collecting = false;
    }
  });
}
