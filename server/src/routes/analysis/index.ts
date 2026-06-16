import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../../analysis/config.js';
import { DEFAULT_MODEL } from '../../analysis/constants.js';
import { commitRoutes } from './commit.js';
import { criteriaRoutes } from './criteria.js';
import { matchingRoutes } from './matching.js';

export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  // ── A1: статус ──────────────────────────────────────────────────────────
  app.get('/api/analysis/status', async () => {
    return { apiAvailable: hasApiKey(), defaultModel: DEFAULT_MODEL };
  });

  await criteriaRoutes(app);
  await matchingRoutes(app);
  await commitRoutes(app);
}
