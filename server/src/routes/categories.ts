// API дерева категорій OLX і базових наборів (docs/plans/base-criteria.md).
import type { InStatement } from '@libsql/client';
import type { FastifyInstance } from 'fastify';
import {
  MAX_CHAIN_DEPTH,
  applyCriteriaBody,
  baseKeys,
  loadBaseSets,
  loadCategoryChain,
  mergeBaseCriteria,
  parseBaseDisabled,
  serializeBaseDisabled,
} from '../analysis/baseCriteria.js';
import { hasApiKey } from '../analysis/config.js';
import {
  ANALYSIS_ERRORS,
  BASE_CRITERIA_DRAFT,
  DEFAULT_MODEL,
  OPPOSITE_MODE,
  isMode,
} from '../analysis/constants.js';
import { parseCriteriaConfig, phraseKey, serializeCriteriaConfig } from '../analysis/criteria.js';
import { chat } from '../analysis/openrouter.js';
import { excludeOppositeCriteria, parseCriteriaResponse } from '../analysis/parse.js';
import { buildBaseCriteriaPrompt } from '../analysis/prompts.js';
import {
  filterActive,
  parseLocalFilters,
  parseRemapOps,
  planRemapSteps,
  remapBaseDisabled,
  remapListingStatements,
} from '../analysis/remap.js';
import { collectCategories } from '../categories/collector.js';
import { SEED_WORDS } from '../categories/seedWords.js';
import { dbAll, dbBatchChunked, dbGet, dbRun } from '../db/db.js';
import { logError } from '../logger.js';
import { recomputeFilteredOut } from '../scraper/refilter.js';
import type { CategoryNode, CriteriaConfig, CriterionGroup } from '../types.js';

const ALREADY_RUNNING = 'Збір дерева категорій уже йде';
const CATEGORY_NOT_FOUND = 'Категорію не знайдено';

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
    const { own, inherited } = await loadOwnAndInherited(chain, id);
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

  // Чернетка базового набору категорії від LLM (docs/plans/base-criteria.md). НЕ зберігає — людина переглядає й
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
      const fresh = parseCriteriaResponse(raw).filter((c) => !taken.has(phraseKey(c)));
      return { criteria: excludeOppositeCriteria(fresh, opposite).slice(0, BASE_CRITERIA_DRAFT) };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Перейменувати / об'єднати (`to` — назва) або видалити (`to = null`) власний пункт набору категорії (тіло як у
  // remap пошуку). Пункти в оголошеннях і local_filters пошуків, чия автокатегорія — ця категорія або її
  // нащадок, переписуються тим самим планом; пошуки в предках не чіпаються. Вимкнення у `base_disabled`
  // цих пошуків теж. Видалення оголошень не чіпає. Усі записи — одним батчем; набір категорії — останнім.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; from?: unknown; to?: unknown; merges?: unknown };
  }>('/api/categories/:id/criteria/remap', async (req, reply) => {
    const id = Number(req.params.id);
    const mode = req.body.mode;
    if (!isMode(mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    const ops = parseRemapOps(req.body);
    if ('error' in ops) return reply.code(400).send({ error: ops.error });

    const chain = await loadCategoryChain(id);
    if (chain.length === 0) return reply.code(404).send({ error: CATEGORY_NOT_FOUND });
    const sets = await loadBaseSets(chain);
    const own: CriteriaConfig = sets.find((s) => s.categoryId === id)?.config ?? { cons: [], pros: [] };

    // `from` — лише власні пункти (назва чи синонім); пункт предка змінюється в самому предку.
    const ownKeys = new Set(own[mode].flatMap((g) => [g.name, ...g.aliases]).map(phraseKey));
    const inheritedKeys = baseKeys(
      mergeBaseCriteria({ cons: [], pros: [] }, sets.filter((s) => s.categoryId !== id), { cons: [], pros: [] }),
      mode,
    );
    for (const key of ops.flatMap((op) => op.from.map(phraseKey))) {
      if (ownKeys.has(key)) continue;
      const error = inheritedKeys.has(key) ? ANALYSIS_ERRORS.BASE_ITEM_INHERITED : ANALYSIS_ERRORS.BASE_ITEM_UNKNOWN;
      return reply.code(400).send({ error });
    }

    // Синонім у `from` означає весь пункт: підміняємо його назвою пункту (planRemap збігає лише за назвою).
    const canonical = new Map<string, string>();
    for (const g of own[mode]) for (const p of [g.name, ...g.aliases]) canonical.set(phraseKey(p), g.name);
    const resolved = ops.map((op) => ({ ...op, from: op.from.map((f) => canonical.get(phraseKey(f)) ?? f) }));

    const { groups, steps } = planRemapSteps(own[mode], resolved);
    const nextOwn: CriteriaConfig = { ...own, [mode]: groups };
    const touchListings = ops.some((op) => op.to !== null);

    // Пошуки піддерева категорії: рекурсивний CTE вниз від :id — без читання всього дерева.
    const searches = await dbAll<{ id: number; local_filters: string | null; base_disabled: string | null }>(
      `WITH RECURSIVE sub(id, depth) AS (
         SELECT id, 0 FROM olx_categories WHERE id = ?
         UNION
         SELECT c.id, sub.depth + 1 FROM olx_categories c JOIN sub ON c.parent_id = sub.id WHERE sub.depth < ?
       )
       SELECT id, local_filters, base_disabled FROM searches WHERE base_category_id IN (SELECT id FROM sub)`,
      [id, MAX_CHAIN_DEPTH],
    );

    const statements: InStatement[] = [];
    const recompute: number[] = [];
    let updated = 0;
    let touchedSearches = 0;
    for (const search of searches) {
      const filters = parseLocalFilters(search.local_filters);
      const disabled = parseBaseDisabled(search.base_disabled);
      const cols: string[] = [];
      const args: Array<string | number> = [];

      let rewritten = 0;
      let nextFilters = filters;
      if (touchListings) {
        const plan = await remapListingStatements(search.id, mode, steps, filters);
        statements.push(...plan.statements);
        rewritten = plan.statements.length;
        nextFilters = plan.nextFilters;
        if (plan.filtersChanged) {
          cols.push('local_filters = ?');
          args.push(JSON.stringify(nextFilters));
        }
      }
      const nextDisabled = remapBaseDisabled(disabled, mode, steps);
      if (nextDisabled !== disabled && serializeBaseDisabled(nextDisabled) !== serializeBaseDisabled(disabled)) {
        cols.push('base_disabled = ?');
        args.push(serializeBaseDisabled(nextDisabled));
      }
      if (cols.length > 0) {
        statements.push({ sql: `UPDATE searches SET ${cols.join(', ')} WHERE id = ?`, args: [...args, search.id] });
      }

      updated += rewritten;
      if (rewritten > 0) touchedSearches++;
      // Фільтр «мінуси/плюси» режиму міг змінити, кого ховає, — перерахувати лише тоді (зайвий прохід по Turso).
      const filterTouched = rewritten > 0 || nextFilters !== filters;
      if (filterTouched && (filterActive(filters, mode) || filterActive(nextFilters, mode))) recompute.push(search.id);
    }
    // Набір категорії — останнім: після часткового збою чанків той самий remap повторюється з тим самим результатом.
    statements.push({
      sql: "UPDATE base_criteria SET criteria = ?, updated_at = datetime('now') WHERE category_id = ?",
      args: [serializeCriteriaConfig(nextOwn), id],
    });
    await dbBatchChunked(statements);

    for (const searchId of recompute) await recomputeFilteredOut(searchId);
    return { criteria: nextOwn, updated, searches: touchedSearches };
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
