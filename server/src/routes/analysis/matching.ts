import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import {
  ANALYSIS_ERRORS,
  AUTO_CHUNK_SIZE,
  BULLET_PREFIX,
  DEFAULT_MODEL,
  JSON_EXPORT_INDENT,
  MANUAL_ZIP_CHUNK_SIZE,
  MAX_ANALYZE_IDS,
  MIME_JSON,
  MIME_XLSX,
  MODE_LABEL,
  PREVIEW_XLSX_WIDTHS,
  isMode,
} from '../../analysis/constants.js';
import { requireApiKey, requireMode, requireSearch } from '../../analysis/guards.js';
import { resolveCriteriaThreshold, runJevMatching } from '../../analysis/jevEngine.js';
import { ZIP_FILES, numberedFile } from '../../analysis/manualZip.js';
import { chat } from '../../analysis/openrouter.js';
import { mergeResults, parseMatchingResponse } from '../../analysis/parse.js';
import {
  PATTERNS_EXAMPLE_JSON,
  buildChunkListings,
  buildManualZipInstructions,
  buildMatchingPrompt,
} from '../../analysis/prompts.js';
import { ANALYZE_PY_PATH, chunk, descriptionMap, toPromptListing } from '../../analysis/promptData.js';
import { loadListings } from '../../db/repos/analysis.js';
import { resolveEffectiveCriteria } from '../../analysis/baseCriteria.js';
import { enabledGroups } from '../../analysis/criteria.js';
import { stripHtml } from '../../analysis/text.js';
import { BadRequestError, errorMessage } from '../../errors.js';
import { buildXlsxBuffer } from '../../export/xlsx.js';
import { getLogger } from '../../logger.js';
import type { AnalysisMode, AnalyzeResponse, AnalyzedListing } from '../../types.js';
import { parseIds, sendZip, type ZipEntry } from '../http.js';

export async function matchingRoutes(app: FastifyInstance): Promise<void> {
  // Авто matching (LLM — чанки по AUTO_CHUNK_SIZE; Jev — пул по оголошенню). НЕ пише в БД.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; ids?: number[]; model?: string; reasoning?: boolean; engine?: string; threshold?: number };
  }>('/api/searches/:id/analyze', async (req) => {
    const search = await requireSearch(Number(req.params.id));
    const { id } = search;
    const mode = requireMode(req.body.mode);
    requireApiKey();

    const ids = parseIds(req.body.ids);
    if (ids.length > MAX_ANALYZE_IDS) throw new BadRequestError(ANALYSIS_ERRORS.TOO_MANY_IDS);

    // Лише категорії з позначкою «в аналізі» (docs/plans/old/criteria-categories.md); ефективні — базові + власні.
    const criteria = enabledGroups((await resolveEffectiveCriteria(search)).config, mode);
    if (criteria.length === 0) throw new BadRequestError(ANALYSIS_ERRORS.NO_CRITERIA);

    const listings = await loadListings(id, ids);
    if (req.body.engine === 'jev') {
      const threshold = resolveCriteriaThreshold(req.body.threshold);
      const response = await runJevMatching(criteria, mode, listings.map(toPromptListing), { threshold });
      getLogger('analysis').info({ searchId: id, mode, threshold, model: response.model, usage: response.usage }, 'Jev: прогін мінусів/плюсів');
      return response;
    }
    const descriptions = descriptionMap(listings);
    const model = req.body.model ?? DEFAULT_MODEL;

    const results: AnalyzedListing[] = [];
    const errors: string[] = [];

    for (const batch of chunk(listings, AUTO_CHUNK_SIZE)) {
      const prompt = buildMatchingPrompt(criteria, batch.map(toPromptListing), mode);
      try {
        const raw = await chat([{ role: 'user', content: prompt }], {
          model,
          reasoning: req.body.reasoning,
        });
        results.push(...parseMatchingResponse(raw, descriptions, criteria));
      } catch (err) {
        errors.push(errorMessage(err));
      }
    }

    const response: AnalyzeResponse = { results, errors };
    return response;
  });

  // Ручний пакет для безкоштовного чату: ZIP з prompt.txt + descriptions/chunk-NNN.json.
  // POST (не GET): список ids може містити тисячі елементів — у query-рядку це
  // перевищує ліміт довжини заголовків (431 Request Header Fields Too Large), тому передаємо тілом.
  app.post<{ Params: { id: string }; Body: { mode?: string; ids?: number[] } }>(
    '/api/searches/:id/analyze/package.zip',
    async (req, reply) => {
      const search = await requireSearch(Number(req.params.id));
      const { id } = search;
      const mode = requireMode(req.body.mode);

      const criteria = enabledGroups((await resolveEffectiveCriteria(search)).config, mode);
      if (criteria.length === 0) throw new BadRequestError(ANALYSIS_ERRORS.NO_CRITERIA);

      const listings = await loadListings(id, parseIds(req.body.ids));

      const entries: ZipEntry[] = [
        { name: ZIP_FILES.PROMPT, content: buildManualZipInstructions(criteria, mode) },
        { name: ZIP_FILES.ANALYZE_PY, content: readFileSync(ANALYZE_PY_PATH) },
        { name: ZIP_FILES.PATTERNS_EXAMPLE, content: PATTERNS_EXAMPLE_JSON },
        ...chunk(listings, MANUAL_ZIP_CHUNK_SIZE).map((group, idx) => ({
          name: numberedFile(ZIP_FILES.DESCRIPTIONS, idx),
          content: JSON.stringify(buildChunkListings(group.map(toPromptListing)), null, JSON_EXPORT_INDENT),
        })),
      ];
      return sendZip(req, reply, `analysis-${mode}-search-${id}.zip`, entries);
    },
  );

  // Парс однієї вставленої відповіді matching + верифікація + мерж у накопичене.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; raw?: string; accumulated?: AnalyzedListing[] };
  }>('/api/searches/:id/analyze/import', async (req, reply) => {
    const search = await requireSearch(Number(req.params.id));
    const mode = requireMode(req.body.mode);
    if (!req.body.raw) throw new BadRequestError(ANALYSIS_ERRORS.EMPTY_RESPONSE);

    // Усі категорії режиму (базові + власні) — для зведення синонімів до назви (вимкнені теж не шкодять).
    const criteria = (await resolveEffectiveCriteria(search)).config[mode];
    const listings = await loadListings(search.id, []);
    const descriptions = descriptionMap(listings);

    let parsed: AnalyzedListing[];
    try {
      parsed = parseMatchingResponse(req.body.raw, descriptions, criteria);
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }

    const accumulated = Array.isArray(req.body.accumulated) ? req.body.accumulated : [];
    const merged = mergeResults(accumulated, parsed);
    const response: AnalyzeResponse = { results: merged, errors: [] };
    return response;
  });

  // Експорт превʼю (крок 3): xlsx | json. Клієнт шле лише {id, criteria} — назву/опис
  // сервер бере з БД (повні описи в body розпухали б за межу bodyLimit і давали 413).
  app.post<{
    Params: { id: string };
    Body: { format?: string; mode?: string; rows?: { id?: number; criteria?: string[] }[] };
  }>('/api/searches/:id/analyze/export', async (req, reply) => {
    const { id } = await requireSearch(Number(req.params.id));
    const mode: AnalysisMode = isMode(req.body.mode) ? req.body.mode : 'cons';
    const reqRows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const label = MODE_LABEL[mode];

    // Підтягуємо назву/опис з БД за id (зберігаючи порядок та критерії з запиту).
    const ids = reqRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    const byId = new Map((await loadListings(id, ids)).map((l) => [l.id, l]));
    const rows = reqRows.map((r) => {
      const l = byId.get(Number(r.id));
      return {
        title: l?.title ?? '',
        description: l?.description ?? '',
        criteria: Array.isArray(r.criteria) ? r.criteria : [],
      };
    });

    if (req.body.format === 'json') {
      reply.header('Content-Disposition', `attachment; filename="analysis-${mode}.json"`);
      reply.type(MIME_JSON);
      return JSON.stringify(
        rows.map((r) => ({ title: r.title, description: stripHtml(r.description), criteria: r.criteria })),
        null,
        JSON_EXPORT_INDENT,
      );
    }

    const buffer = await buildXlsxBuffer(
      label,
      [
        { header: 'Назва', key: 'title', width: PREVIEW_XLSX_WIDTHS.title },
        { header: 'Опис', key: 'description', width: PREVIEW_XLSX_WIDTHS.description },
        { header: label, key: 'criteria', width: PREVIEW_XLSX_WIDTHS.criteria },
      ],
      rows.map((r) => ({
        title: r.title,
        description: stripHtml(r.description),
        criteria: r.criteria.map((c) => `${BULLET_PREFIX}${c}`).join('\n'),
      })),
    );

    reply.header('Content-Disposition', `attachment; filename="analysis-${mode}.xlsx"`);
    reply.type(MIME_XLSX);
    return reply.send(buffer);
  });
}
