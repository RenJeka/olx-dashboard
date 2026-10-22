import type { FastifyInstance } from 'fastify';
import {
  ANALYSIS_ERRORS,
  ANALYSIS_SOURCE,
  BULLET_PREFIX,
  DEFAULT_MODEL,
  MANUAL_MODEL,
  isMode,
} from '../../analysis/constants.js';
import { parseBullets } from '../../analysis/text.js';
import { commitListingCriteria } from '../../db/repos/analysis.js';
import type { CommitItem } from '../../types.js';

/**
 * Підсумкові пункти поля: replace — нові; append — наявні + нові без дублів (порівняння без регістру),
 * наявні зберігаються, нічого не затирається.
 */
function mergeCriteria(existing: string | null | undefined, criteria: string[], append: boolean): string[] {
  if (!append) return criteria;
  const existingItems = parseBullets(existing ?? null);
  const seen = new Set(existingItems.map((c) => c.toLowerCase()));
  return [...existingItems, ...criteria.filter((c) => !seen.has(c.toLowerCase()))];
}

export async function commitRoutes(app: FastifyInstance): Promise<void> {
  // merge='replace' (дефолт) — перезаписати поле; merge='append' — додати нові пункти до
  // наявних (дедуплікація за нормалізованим текстом, наявні зберігаються, нічого не затирається).
  app.post<{
    Body: { mode?: string; items?: CommitItem[]; model?: string; source?: string; merge?: string };
  }>('/api/listings/analyze/commit', async (req, reply) => {
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const source = req.body.source === ANALYSIS_SOURCE.API ? ANALYSIS_SOURCE.API : ANALYSIS_SOURCE.IMPORT;
    const model = req.body.model ?? (source === ANALYSIS_SOURCE.IMPORT ? MANUAL_MODEL : DEFAULT_MODEL);
    const append = req.body.merge === 'append';

    const updated = await commitListingCriteria(req.body.mode, items, { source, model, append }, (existing, criteria) => {
      const merged = mergeCriteria(existing, criteria, append);
      return merged.length > 0 ? merged.map((c) => `${BULLET_PREFIX}${c}`).join('\n') : '';
    });
    return { updated };
  });
}
