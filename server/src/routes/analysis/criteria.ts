import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../../analysis/config.js';
import {
  ANALYSIS_ERRORS,
  DEFAULT_MODEL,
  DEFAULT_SAMPLE_SIZE,
  MAX_IMPORTED_CRITERIA,
  OPPOSITE_MODE,
  isMode,
} from '../../analysis/constants.js';
import {
  applyCriteriaBody,
  baseKeys,
  loadSearchBases,
  mergeBaseCriteria,
  parseBaseDisabled,
  resolveEffectiveCriteria,
  retainAbsorbedOwn,
  serializeBaseDisabled,
} from '../../analysis/baseCriteria.js';
import { parseCriteriaConfig, phraseKey, serializeCriteriaConfig } from '../../analysis/criteria.js';
import { chat } from '../../analysis/openrouter.js';
import { excludeOppositeCriteria, parseCriteriaResponse, parseGroupSuggestions } from '../../analysis/parse.js';
import { remapSearchCriteria } from '../../analysis/criteriaRemap.js';
import { buildCriteriaPrompt, buildGroupingPrompt, pickSample } from '../../analysis/prompts.js';
import { getSearch, loadListings, updateSearchCriteria } from '../../db/repos/analysis.js';

export async function criteriaRoutes(app: FastifyInstance): Promise<void> {
  // Категорії критеріїв пошуку (docs/plans/old/criteria-categories.md; старий формат нормалізується) —
  // ефективні: базові набори автокатегорії й предків + власні (docs/plans/old/base-criteria.md).
  app.get<{ Params: { id: string } }>('/api/searches/:id/criteria', async (req, reply) => {
    const search = await getSearch(Number(req.params.id));
    if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    const { config, category } = await resolveEffectiveCriteria(search);
    return { ...config, category };
  });

  // Генерація критеріїв (авто). Без ключа → 409. Наявні категорії (базові + власні) йдуть у промпт («не повторюй»).
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
    const { config } = await resolveEffectiveCriteria(search);
    const opposite = config[OPPOSITE_MODE[req.body.mode]];
    const prompt = buildCriteriaPrompt(
      search.name,
      sample.map((l) => l.description ?? ''),
      req.body.mode,
      req.body.extra,
      config[req.body.mode],
      opposite,
    );

    try {
      const raw = await chat([{ role: 'user', content: prompt }], {
        model: req.body.model ?? DEFAULT_MODEL,
        reasoning: req.body.reasoning,
      });
      return { criteria: excludeOppositeCriteria(parseCriteriaResponse(raw), opposite) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: message });
    }
  });

  // Автогрупування (docs/plans/old/criteria-auto-group.md): LLM пропонує, які критерії режиму об'єднати. НЕ зберігає —
  // застосування через remap з `merges`. У промпті лише назви критеріїв; < 2 критеріїв — без виклику LLM.
  // Лише власні пункти пошуку: базові змінюються у вікні «Базові плюси й мінуси».
  app.post<{ Params: { id: string }; Body: { mode?: string; model?: string; reasoning?: boolean } }>(
    '/api/searches/:id/criteria/group-suggest',
    async (req, reply) => {
      const search = await getSearch(Number(req.params.id));
      if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!isMode(req.body.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
      const mode = req.body.mode;
      let groups = parseCriteriaConfig(search.analysis_criteria)[mode];
      if (search.base_category_id !== null && groups.length >= 2) {
        // Власний пункт, поглинутий базовим (збіг формулювань), — уже базовий: не пропонуємо.
        const locked = baseKeys((await resolveEffectiveCriteria(search)).config, mode);
        groups = groups.filter((g) => ![g.name, ...g.aliases].some((p) => locked.has(phraseKey(p))));
      }
      if (groups.length < 2) return { groups: [] };
      if (!hasApiKey()) return reply.code(409).send({ error: ANALYSIS_ERRORS.NO_API_KEY });

      try {
        const raw = await chat([{ role: 'user', content: buildGroupingPrompt(search.name, groups, mode) }], {
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
      const { config } = await resolveEffectiveCriteria(search);
      const prompt = buildCriteriaPrompt(
        search.name,
        sample.map((l) => l.description ?? ''),
        req.query.mode,
        req.query.extra,
        config[req.query.mode],
        config[OPPOSITE_MODE[req.query.mode]],
      );
      return { prompt };
    },
  );

  // Парс вставленої відповіді LLM з критеріями (ручний). НЕ зберігає. Ліміт — MAX_IMPORTED_CRITERIA (людина
  // могла попросити більше, ніж MAX_CRITERIA генерації).
  app.post<{ Params: { id: string }; Body: { mode?: string; raw?: string } }>(
    '/api/searches/:id/criteria/import',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!(await getSearch(id))) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!req.body.raw) return reply.code(400).send({ error: ANALYSIS_ERRORS.EMPTY_RESPONSE });
      try {
        return { criteria: parseCriteriaResponse(req.body.raw, MAX_IMPORTED_CRITERIA) };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // Зберегти список категорій режиму цілком (вмик/вимк, додані, вийнятий синонім). Оголошень не чіпає.
  // Приймає й старий формат (масив рядків). Відсутній режим лишається як є. Базові пункти (з полем `base`)
  // в analysis_criteria не пишуться — лише їх вимкнення в base_disabled; поглинуті базовими власні пункти
  // лишаються збереженими (retainAbsorbedOwn). Відповідь — як GET (ефективний список + category).
  app.put<{ Params: { id: string }; Body: unknown }>('/api/searches/:id/criteria', async (req, reply) => {
    const id = Number(req.params.id);
    const search = await getSearch(id);
    if (!search) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });

    const stored = parseCriteriaConfig(search.analysis_criteria);
    const { bases, category } = await loadSearchBases(search.base_category_id);
    const next = applyCriteriaBody(req.body, stored, parseBaseDisabled(search.base_disabled));
    const own = retainAbsorbedOwn(next.own, stored, bases, next.disabled);
    await updateSearchCriteria(id, serializeCriteriaConfig(own), serializeBaseDisabled(next.disabled));
    return { ...mergeBaseCriteria(own, bases, next.disabled), category };
  });

  // Об'єднати / перейменувати (`to` — назва) або видалити (`to = null`) формулювання: категорії пошуку +
  // пункти в оголошеннях і локальних фільтрах. AI не викликається — це перейменування пунктів.
  // Лише власні пункти: формулювання базового пункту (назва чи синонім) у `from` → 400.
  // `listings: false` (лише для видалення) — прибрати зі списку, оголошення не чіпати.
  // `merges: [{from, to}]` (автогрупування, docs/plans/old/criteria-auto-group.md) — кілька об'єднань одним
  // проходом по оголошеннях і одним перерахунком filtered_out; тоді `from`/`to` ігноруються.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; from?: unknown; to?: unknown; listings?: boolean; merges?: unknown };
  }>('/api/searches/:id/criteria/remap', (req) => remapSearchCriteria(Number(req.params.id), req.body));
}
