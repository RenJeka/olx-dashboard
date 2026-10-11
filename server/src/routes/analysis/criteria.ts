import type { InStatement } from '@libsql/client';
import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../../analysis/config.js';
import {
  ANALYSIS_ERRORS,
  DEFAULT_MODEL,
  DEFAULT_SAMPLE_SIZE,
  isMode,
} from '../../analysis/constants.js';
import {
  normalizeGroups,
  parseCriteriaConfig,
  planRemap,
  remapBullets,
  remapLocalFilters,
  serializeCriteriaConfig,
} from '../../analysis/criteria.js';
import { chat } from '../../analysis/openrouter.js';
import { parseCriteriaResponse } from '../../analysis/parse.js';
import { buildCriteriaPrompt, pickSample } from '../../analysis/prompts.js';
import { getSearch, loadListings } from '../../analysis/repo.js';
import { dbAll, dbBatchChunked, dbGet, dbRun } from '../../db/db.js';
import { recomputeFilteredOut } from '../../scraper/refilter.js';
import type { CriteriaConfig, LocalFilters } from '../../types.js';

export async function criteriaRoutes(app: FastifyInstance): Promise<void> {
  // Категорії критеріїв пошуку (docs/plans/criteria-categories.md; старий формат нормалізується).
  app.get<{ Params: { id: string } }>('/api/searches/:id/criteria', async (req, reply) => {
    const search = await getSearch(Number(req.params.id));
    if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    return parseCriteriaConfig(search.analysis_criteria);
  });

  // Генерація критеріїв (авто). Без ключа → 409. Наявні категорії йдуть у промпт («не повторюй»).
  app.post<{
    Params: { id: string };
    Body: { mode?: string; sampleSize?: number; model?: string; reasoning?: boolean; extra?: string };
  }>('/api/searches/:id/criteria/generate', async (req, reply) => {
    const id = Number(req.params.id);
    const search = await getSearch(id);
    if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    if (!hasApiKey()) {
      return reply.code(409).send({ error: ANALYSIS_ERRORS.NO_API_KEY });
    }

    const listings = await loadListings(id, []);
    const sample = pickSample(listings, req.body.sampleSize ?? DEFAULT_SAMPLE_SIZE);
    const prompt = buildCriteriaPrompt(
      search.name,
      sample.map((l) => l.description ?? ''),
      req.body.mode,
      req.body.extra,
      parseCriteriaConfig(search.analysis_criteria)[req.body.mode],
    );

    try {
      const raw = await chat([{ role: 'user', content: prompt }], {
        model: req.body.model ?? DEFAULT_MODEL,
        reasoning: req.body.reasoning,
      });
      return { criteria: parseCriteriaResponse(raw) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: message });
    }
  });

  // Промпт генерації критеріїв (ручний) — готовий текст для копіювання.
  app.get<{ Params: { id: string }; Querystring: { mode?: string; extra?: string } }>(
    '/api/searches/:id/criteria/prompt',
    async (req, reply) => {
      const id = Number(req.params.id);
      const search = await getSearch(id);
      if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!isMode(req.query.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });

      const listings = await loadListings(id, []);
      const sample = pickSample(listings, DEFAULT_SAMPLE_SIZE);
      const prompt = buildCriteriaPrompt(
        search.name,
        sample.map((l) => l.description ?? ''),
        req.query.mode,
        req.query.extra,
        parseCriteriaConfig(search.analysis_criteria)[req.query.mode],
      );
      return { prompt };
    },
  );

  // Парс вставленої відповіді LLM з критеріями (ручний). НЕ зберігає.
  app.post<{ Params: { id: string }; Body: { mode?: string; raw?: string } }>(
    '/api/searches/:id/criteria/import',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!(await getSearch(id))) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!req.body.raw) return reply.code(400).send({ error: ANALYSIS_ERRORS.EMPTY_RESPONSE });
      try {
        return { criteria: parseCriteriaResponse(req.body.raw) };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // Зберегти список категорій режиму цілком (вмик/вимк, додані, вийнятий синонім). Оголошень не чіпає.
  // Приймає й старий формат (масив рядків). Відсутній режим лишається як є.
  app.put<{ Params: { id: string }; Body: { cons?: unknown; pros?: unknown } }>(
    '/api/searches/:id/criteria',
    async (req, reply) => {
      const id = Number(req.params.id);
      const search = await getSearch(id);
      if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });

      const current = parseCriteriaConfig(search.analysis_criteria);
      const next: CriteriaConfig = {
        cons: Array.isArray(req.body.cons) ? normalizeGroups(req.body.cons) : current.cons,
        pros: Array.isArray(req.body.pros) ? normalizeGroups(req.body.pros) : current.pros,
      };
      await dbRun('UPDATE searches SET analysis_criteria = ? WHERE id = ?', [serializeCriteriaConfig(next), id]);
      return next;
    },
  );

  // Об'єднати / перейменувати (`to` — назва) або видалити (`to = null`) формулювання: категорії пошуку +
  // пункти в оголошеннях і локальних фільтрах. AI не викликається — це перейменування пунктів.
  // `listings: false` (лише для видалення) — прибрати зі списку, оголошення не чіпати.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; from?: unknown; to?: unknown; listings?: boolean };
  }>('/api/searches/:id/criteria/remap', async (req, reply) => {
    const id = Number(req.params.id);
    const mode = req.body.mode;
    if (!isMode(mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    const from = Array.isArray(req.body.from)
      ? req.body.from.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      : [];
    const to = typeof req.body.to === 'string' && req.body.to.trim() !== '' ? req.body.to : null;
    if (from.length === 0) return reply.code(400).send({ error: 'Не обрано жодного критерію' });
    if (req.body.to !== null && to === null) return reply.code(400).send({ error: 'Порожня назва категорії' });

    const search = await dbGet<{ analysis_criteria: string; local_filters: string }>(
      'SELECT analysis_criteria, local_filters FROM searches WHERE id = ?',
      [id],
    );
    if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });

    const config = parseCriteriaConfig(search.analysis_criteria);
    const plan = planRemap(config[mode], from, to);
    const nextConfig: CriteriaConfig = { ...config, [mode]: plan.groups };
    const touchListings = to !== null || req.body.listings !== false;

    const statements: InStatement[] = [];
    let localFilters: LocalFilters = {};
    try {
      localFilters = JSON.parse(search.local_filters || '{}') as LocalFilters;
    } catch {
      localFilters = {};
    }
    const nextFilters = touchListings ? remapLocalFilters(localFilters, mode, plan.keys, to) : localFilters;

    if (touchListings) {
      // mode — з whitelist (isMode): 'cons' | 'pros', безпечна інтерполяція.
      const rows = await dbAll<{ id: number; val: string | null }>(
        `SELECT id, ${mode} AS val FROM listings WHERE search_id = ? AND ${mode} <> ''`,
        [id],
      );
      for (const row of rows) {
        const next = remapBullets(row.val, plan.keys, to);
        if (next !== row.val) {
          statements.push({ sql: `UPDATE listings SET ${mode} = ? WHERE id = ?`, args: [next, row.id] });
        }
      }
    }
    const updated = statements.length;
    // Пошук — останнім: після часткового збою чанків той самий remap повторюється з тим самим результатом.
    statements.push({
      sql: 'UPDATE searches SET analysis_criteria = ?, local_filters = ? WHERE id = ?',
      args: [serializeCriteriaConfig(nextConfig), JSON.stringify(nextFilters), id],
    });
    await dbBatchChunked(statements);

    // Об'єднання може змінити, кого ховає фільтр «мінуси/плюси» (було чи стало правило режиму) —
    // перерахувати приховані. Без такого правила перерахунок не потрібен (зайвий прохід по Turso).
    const filterActive = (f: LocalFilters) => (f[mode]?.length ?? 0) > 0;
    const { filtered_out_count } =
      touchListings && (filterActive(localFilters) || filterActive(nextFilters))
        ? await recomputeFilteredOut(id)
        : { filtered_out_count: null };
    return { criteria: nextConfig, updated, filtered_out_count };
  });
}
