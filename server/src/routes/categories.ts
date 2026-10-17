// API дерева категорій OLX і базових наборів (docs/plans/base-criteria.md).
import type { FastifyInstance } from 'fastify';
import { applyCriteriaBody, loadBaseSets, loadCategoryChain, mergeBaseCriteria } from '../analysis/baseCriteria.js';
import { parseCriteriaConfig, serializeCriteriaConfig } from '../analysis/criteria.js';
import { collectCategories } from '../categories/collector.js';
import { SEED_WORDS } from '../categories/seedWords.js';
import { dbAll, dbGet, dbRun } from '../db/db.js';
import { logError } from '../logger.js';
import type { CategoryNode, CriteriaConfig } from '../types.js';

const ALREADY_RUNNING = 'Збір дерева категорій уже йде';
const CATEGORY_NOT_FOUND = 'Категорію не знайдено';

/** Прапорець «збір іде» — in-memory (single-user, один процес). */
let collecting = false;

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  // Дерево категорій для вікна «Базові плюси й мінуси»: усі вузли + чи є непорожній набір. Два читання.
  app.get('/api/categories', async () => {
    const [nodes, sets] = await Promise.all([
      dbAll<{ id: number; parent_id: number | null; label: string; slug: string }>(
        'SELECT id, parent_id, label, slug FROM olx_categories ORDER BY label',
      ),
      dbAll<{ category_id: number; criteria: string | null }>('SELECT category_id, criteria FROM base_criteria'),
    ]);
    const withSet = new Set(
      sets
        .filter((s) => {
          const config = parseCriteriaConfig(s.criteria);
          return config.cons.length + config.pros.length > 0;
        })
        .map((s) => s.category_id),
    );
    return nodes.map(
      (n): CategoryNode & { hasSet: boolean } => ({
        id: n.id,
        parentId: n.parent_id,
        label: n.label,
        slug: n.slug,
        hasSet: withSet.has(n.id),
      }),
    );
  });

  // Набір категорії: `own` — як збережено, `inherited` — злиті набори строгих предків (з `base`).
  // Ланцюжок (CTE) + один read base_criteria по його id.
  app.get<{ Params: { id: string } }>('/api/categories/:id/criteria', async (req, reply) => {
    const id = Number(req.params.id);
    const chain = await loadCategoryChain(id);
    if (chain.length === 0) return reply.code(404).send({ error: CATEGORY_NOT_FOUND });
    const sets = await loadBaseSets(chain);
    const ownSet = sets.find((s) => s.categoryId === id);
    const own: CriteriaConfig = ownSet ? ownSet.config : { cons: [], pros: [] };
    const inherited = mergeBaseCriteria(
      { cons: [], pros: [] },
      sets.filter((s) => s.categoryId !== id),
      { cons: [], pros: [] },
    );
    return { own, inherited };
  });

  // Зберегти набір категорії (тіло як у PUT /api/searches/:id/criteria; відсутній режим лишається).
  // Успадковані пункти (з `base`) не пишуться. Оголошень не чіпає.
  app.put<{ Params: { id: string }; Body: unknown }>('/api/categories/:id/criteria', async (req, reply) => {
    const id = Number(req.params.id);
    const exists = await dbGet<{ id: number }>('SELECT id FROM olx_categories WHERE id = ?', [id]);
    if (!exists) return reply.code(404).send({ error: CATEGORY_NOT_FOUND });

    const row = await dbGet<{ criteria: string | null }>('SELECT criteria FROM base_criteria WHERE category_id = ?', [
      id,
    ]);
    const { own } = applyCriteriaBody(req.body, parseCriteriaConfig(row?.criteria));
    await dbRun(
      `INSERT INTO base_criteria (category_id, criteria, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(category_id) DO UPDATE SET criteria = excluded.criteria, updated_at = excluded.updated_at`,
      [id, serializeCriteriaConfig(own)],
    );
    return own;
  });

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
