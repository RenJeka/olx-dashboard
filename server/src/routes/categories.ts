// API дерева категорій OLX і базових наборів (docs/plans/old/base-criteria.md).
import type { FastifyInstance } from 'fastify';
import { applyCriteriaBody, loadBaseSets, loadCategoryChain, mergeBaseCriteria } from '../analysis/baseCriteria.js';
import { hasApiKey } from '../analysis/config.js';
import {
  ANALYSIS_ERRORS,
  BASE_CRITERIA_DRAFT,
  DEFAULT_MODEL,
  OPPOSITE_MODE,
  isMode,
} from '../analysis/constants.js';
import { parseCriteriaConfig, phraseKey, serializeCriteriaConfig } from '../analysis/criteria.js';
import { CATEGORY_NOT_FOUND, remapCategoryCriteria } from '../analysis/criteriaRemap.js';
import { chat } from '../analysis/openrouter.js';
import { excludeOppositeCriteria, parseCriteriaResponse } from '../analysis/parse.js';
import { buildBaseCriteriaPrompt } from '../analysis/prompts.js';
import { collectCategories } from '../categories/collector.js';
import { SEED_WORDS } from '../categories/seedWords.js';
import {
  categoryExists,
  getBaseCriteriaText,
  listAllBaseCriteria,
  listCategoryRows,
  upsertBaseCriteria,
} from '../db/repos/categories.js';
import { logError } from '../logger.js';
import { isAnyScanRunning } from '../scanner/abortControl.js';
import type { CategoryNode, CriteriaConfig, CriterionGroup } from '../types.js';

const ALREADY_RUNNING = 'Збір дерева категорій уже йде';
const SCAN_RUNNING = 'Іде скан — зберіть дерево після нього';

/** Прапорець «збір іде» — in-memory (single-user, один процес). */
let collecting = false;

/** Власний набір категорії та злиті набори її предків (`inherited`, пункти з `base`) — за готовим ланцюжком. */
async function loadOwnAndInherited(
  chain: CategoryNode[],
  id: number,
): Promise<{ own: CriteriaConfig; inherited: CriteriaConfig }> {
  const sets = await loadBaseSets(chain);
  const none: CriteriaConfig = { cons: [], pros: [] };
  const own = sets.find((s) => s.categoryId === id)?.config ?? none;
  const inherited = mergeBaseCriteria(none, sets.filter((s) => s.categoryId !== id), { cons: [], pros: [] });
  return { own, inherited };
}

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  // Дерево категорій для вікна «Базові плюси й мінуси»: усі вузли + чи є непорожній набір. Два читання.
  app.get('/api/categories', async () => {
    const [nodes, sets] = await Promise.all([listCategoryRows(), listAllBaseCriteria()]);
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
    const { own, inherited } = await loadOwnAndInherited(chain, id);
    return { own, inherited };
  });

  // Зберегти набір категорії (тіло як у PUT /api/searches/:id/criteria; відсутній режим лишається).
  // Успадковані пункти (з `base`) не пишуться. Оголошень не чіпає.
  app.put<{ Params: { id: string }; Body: unknown }>('/api/categories/:id/criteria', async (req, reply) => {
    const id = Number(req.params.id);
    if (!(await categoryExists(id))) return reply.code(404).send({ error: CATEGORY_NOT_FOUND });

    const { own } = applyCriteriaBody(req.body, parseCriteriaConfig(await getBaseCriteriaText(id)));
    await upsertBaseCriteria(id, serializeCriteriaConfig(own));
    return own;
  });

  // Чернетка базового набору категорії від LLM (docs/plans/old/base-criteria.md). НЕ зберігає — людина переглядає й
  // зберігає через PUT. У промпті лише шлях категорії та назви пунктів: «вже є» = власні + успадковані режиму,
  // «НЕ включай» = власні + успадковані протилежного. Відповідь: без наявних, без протилежних, ≤ BASE_CRITERIA_DRAFT.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; model?: string; reasoning?: boolean };
  }>('/api/categories/:id/criteria/generate', async (req, reply) => {
    const id = Number(req.params.id);
    const chain = await loadCategoryChain(id);
    if (chain.length === 0) return reply.code(404).send({ error: CATEGORY_NOT_FOUND });
    const mode = req.body?.mode;
    if (!isMode(mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    if (!hasApiKey()) return reply.code(409).send({ error: ANALYSIS_ERRORS.NO_API_KEY });

    const { own, inherited } = await loadOwnAndInherited(chain, id);
    const both = (m: typeof mode): CriterionGroup[] => [...inherited[m], ...own[m]];
    const existing = both(mode);
    const opposite = both(OPPOSITE_MODE[mode]);
    const prompt = buildBaseCriteriaPrompt(
      chain.map((n) => n.label),
      mode,
      existing,
      opposite,
    );

    try {
      const raw = await chat([{ role: 'user', content: prompt }], {
        model: req.body.model ?? DEFAULT_MODEL,
        reasoning: req.body.reasoning,
      });
      const taken = new Set(existing.flatMap((g) => [g.name, ...g.aliases]).map(phraseKey));
      // Без ліміту парсера: наявні пункти на початку відповіді не мають скорочувати чернетку.
      const fresh = parseCriteriaResponse(raw, Infinity).filter((c) => !taken.has(phraseKey(c)));
      return { criteria: excludeOppositeCriteria(fresh, opposite).slice(0, BASE_CRITERIA_DRAFT) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Перейменувати / об'єднати (`to` — назва) або видалити (`to = null`) власний пункт набору категорії (тіло як у
  // remap пошуку). Пункти в оголошеннях і local_filters пошуків, чия автокатегорія — ця категорія або її
  // нащадок, переписуються тим самим планом; пошуки в предках не чіпаються. Вимкнення у `base_disabled`
  // цих пошуків теж; поглинуті базовим власні пункти (`analysis_criteria`) перейменовуються разом із ним
  // (remapOwnGroups). Видалення оголошень і власних пунктів не чіпає. Усі записи — одним батчем; набір
  // категорії — останнім.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; from?: unknown; to?: unknown; merges?: unknown };
  }>('/api/categories/:id/criteria/remap', (req) => remapCategoryCriteria(Number(req.params.id), req.body));

  // Синхронний збір дерева за SEED_WORDS (~хвилина через паузи між запитами). Паралельний виклик → 409;
  // під час скану теж 409 — не ходити до OLX двома потоками одночасно (ввічливість).
  app.post('/api/categories/collect', async (_req, reply) => {
    if (collecting) return reply.code(409).send({ error: ALREADY_RUNNING });
    if (isAnyScanRunning()) return reply.code(409).send({ error: SCAN_RUNNING });
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
