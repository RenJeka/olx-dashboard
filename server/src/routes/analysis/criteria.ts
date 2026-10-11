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
import { parseCriteriaResponse, parseGroupSuggestions } from '../../analysis/parse.js';
import { buildCriteriaPrompt, buildGroupingPrompt, pickSample } from '../../analysis/prompts.js';
import { getSearch, loadListings } from '../../analysis/repo.js';
import { dbAll, dbBatchChunked, dbGet, dbRun } from '../../db/db.js';
import { recomputeFilteredOut } from '../../scraper/refilter.js';
import type { CriteriaConfig, LocalFilters } from '../../types.js';

export async function criteriaRoutes(app: FastifyInstance): Promise<void> {
  // Категорії критеріїв пошуку (docs/plans/old/criteria-categories.md; старий формат нормалізується).
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

  // Автогрупування (docs/plans/old/criteria-auto-group.md): LLM пропонує, які критерії режиму об'єднати. НЕ зберігає —
  // застосування через remap з `merges`. У промпті лише назви критеріїв; < 2 критеріїв — без виклику LLM.
  app.post<{ Params: { id: string }; Body: { mode?: string; model?: string; reasoning?: boolean } }>(
    '/api/searches/:id/criteria/group-suggest',
    async (req, reply) => {
      const search = await getSearch(Number(req.params.id));
      if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!isMode(req.body.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
      const groups = parseCriteriaConfig(search.analysis_criteria)[req.body.mode];
      if (groups.length < 2) return { groups: [] };
      if (!hasApiKey()) return reply.code(409).send({ error: ANALYSIS_ERRORS.NO_API_KEY });

      try {
        const raw = await chat([{ role: 'user', content: buildGroupingPrompt(search.name, groups, req.body.mode) }], {
          model: req.body.model ?? DEFAULT_MODEL,
          reasoning: req.body.reasoning,
        });
        return { groups: parseGroupSuggestions(raw, groups) };
      } catch (err) {
        return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

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
  // `merges: [{from, to}]` (автогрупування, docs/plans/old/criteria-auto-group.md) — кілька об'єднань одним
  // проходом по оголошеннях і одним перерахунком filtered_out; тоді `from`/`to` ігноруються.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; from?: unknown; to?: unknown; listings?: boolean; merges?: unknown };
  }>('/api/searches/:id/criteria/remap', async (req, reply) => {
    const id = Number(req.params.id);
    const mode = req.body.mode;
    if (!isMode(mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });

    let ops: Array<{ from: string[]; to: string | null }>;
    if (req.body.merges !== undefined) {
      if (!Array.isArray(req.body.merges) || req.body.merges.length === 0) {
        return reply.code(400).send({ error: 'Не обрано жодної групи' });
      }
      ops = req.body.merges.map((m: unknown) => {
        const obj = (m && typeof m === 'object' ? m : {}) as { from?: unknown; to?: unknown };
        return { from: phraseList(obj.from), to: nonEmpty(obj.to) };
      });
      if (ops.some((op) => op.from.length === 0)) return reply.code(400).send({ error: 'Не обрано жодного критерію' });
      if (ops.some((op) => op.to === null)) return reply.code(400).send({ error: 'Порожня назва категорії' });
    } else {
      const from = phraseList(req.body.from);
      const to = nonEmpty(req.body.to);
      if (from.length === 0) return reply.code(400).send({ error: 'Не обрано жодного критерію' });
      if (req.body.to !== null && to === null) return reply.code(400).send({ error: 'Порожня назва категорії' });
      ops = [{ from, to }];
    }

    const search = await dbGet<{ analysis_criteria: string; local_filters: string }>(
      'SELECT analysis_criteria, local_filters FROM searches WHERE id = ?',
      [id],
    );
    if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });

    // Об'єднання застосовуються по черзі до списку категорій; ті самі кроки — до пунктів оголошень і фільтрів.
    const config = parseCriteriaConfig(search.analysis_criteria);
    let groups = config[mode];
    const steps: Array<{ keys: Set<string>; to: string | null }> = [];
    for (const op of ops) {
      const plan = planRemap(groups, op.from, op.to);
      groups = plan.groups;
      steps.push({ keys: plan.keys, to: op.to });
    }
    const nextConfig: CriteriaConfig = { ...config, [mode]: groups };
    const touchListings = ops.some((op) => op.to !== null) || req.body.listings !== false;

    const statements: InStatement[] = [];
    let localFilters: LocalFilters = {};
    try {
      localFilters = JSON.parse(search.local_filters || '{}') as LocalFilters;
    } catch {
      localFilters = {};
    }
    const nextFilters = touchListings
      ? steps.reduce((f, step) => remapLocalFilters(f, mode, step.keys, step.to), localFilters)
      : localFilters;

    if (touchListings) {
      // mode — з whitelist (isMode): 'cons' | 'pros', безпечна інтерполяція.
      const rows = await dbAll<{ id: number; val: string | null }>(
        `SELECT id, ${mode} AS val FROM listings WHERE search_id = ? AND ${mode} <> ''`,
        [id],
      );
      for (const row of rows) {
        const next = steps.reduce((text, step) => remapBullets(text, step.keys, step.to), row.val);
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

/** Непорожні рядки з тіла запиту (формулювання критеріїв). */
function phraseList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : [];
}

/** Рядок із тіла запиту або null, якщо порожній чи не рядок. */
function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
