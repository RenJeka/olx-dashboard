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
import { db } from '../../db/db.js';
import type { CommitItem } from '../../types.js';

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
    const column = req.body.mode; // 'cons' | 'pros' — безпечно (whitelist через isMode)

    const stmt = db.prepare(
      `UPDATE listings SET ${column} = ?, analysis_at = datetime('now'),
              analysis_source = ?, analysis_model = ?, analysis_stale = 0
       WHERE id = ?`,
    );
    const selectStmt = db.prepare(`SELECT ${column} AS val FROM listings WHERE id = ?`);

    const run = db.transaction((rows: CommitItem[]) => {
      let updated = 0;
      for (const row of rows) {
        let criteria = row.criteria;
        if (append) {
          const existing = (selectStmt.get(row.id) as { val: string | null } | undefined)?.val ?? null;
          const existingItems = parseBullets(existing);
          const seen = new Set(existingItems.map((c) => c.toLowerCase()));
          const additions = row.criteria.filter((c) => !seen.has(c.toLowerCase()));
          criteria = [...existingItems, ...additions];
        }
        const text = criteria.length > 0 ? criteria.map((c) => `${BULLET_PREFIX}${c}`).join('\n') : '';
        const info = stmt.run(text, source, model, row.id);
        updated += info.changes;
      }
      return updated;
    });

    const updated = run(items);
    return { updated };
  });
}
