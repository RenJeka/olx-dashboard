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

    // column — з whitelist (isMode): 'cons' | 'pros', безпечна інтерполяція.
    const UPDATE_SQL = `UPDATE listings SET ${column} = ?, analysis_at = datetime('now'),
              analysis_source = ?, analysis_model = ?, analysis_stale = 0
       WHERE id = ?`;
    const SELECT_SQL = `SELECT ${column} AS val FROM listings WHERE id = ?`;

    // Інтерактивна транзакція: append-режим читає наявне значення перед записом → атомарність циклу.
    const tx = await db.transaction('write');
    let updated = 0;
    try {
      for (const row of items) {
        let criteria = row.criteria;
        if (append) {
          const existingRows = await tx.execute({ sql: SELECT_SQL, args: [row.id] });
          const existing = (existingRows.rows[0] as unknown as { val: string | null } | undefined)?.val ?? null;
          const existingItems = parseBullets(existing);
          const seen = new Set(existingItems.map((c) => c.toLowerCase()));
          const additions = row.criteria.filter((c) => !seen.has(c.toLowerCase()));
          criteria = [...existingItems, ...additions];
        }
        const text = criteria.length > 0 ? criteria.map((c) => `${BULLET_PREFIX}${c}`).join('\n') : '';
        const info = await tx.execute({ sql: UPDATE_SQL, args: [text, source, model, row.id] });
        updated += info.rowsAffected;
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }

    return { updated };
  });
}
