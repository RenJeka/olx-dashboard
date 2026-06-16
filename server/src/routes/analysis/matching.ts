import { readFileSync } from 'node:fs';
import { ZipArchive } from 'archiver';
import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../../analysis/config.js';
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
  MIME_ZIP,
  MODE_LABEL,
  PREVIEW_XLSX_WIDTHS,
  isMode,
} from '../../analysis/constants.js';
import { chat } from '../../analysis/openrouter.js';
import { mergeResults, parseMatchingResponse } from '../../analysis/parse.js';
import {
  PATTERNS_EXAMPLE_JSON,
  buildChunkListings,
  buildManualZipInstructions,
  buildMatchingPrompt,
} from '../../analysis/prompts.js';
import { ANALYZE_PY_PATH, chunk, descriptionMap, toPromptListing } from '../../analysis/promptData.js';
import { getSearch, getSavedCriteria, loadListings } from '../../analysis/repo.js';
import { stripHtml } from '../../analysis/text.js';
import { buildXlsxBuffer } from '../../export/xlsx.js';
import type { AnalysisMode, AnalyzeResponse, AnalyzedListing } from '../../types.js';

export async function matchingRoutes(app: FastifyInstance): Promise<void> {
  // Авто matching (чанки по AUTO_CHUNK_SIZE). НЕ пише в БД.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; ids?: number[]; model?: string; reasoning?: boolean };
  }>('/api/searches/:id/analyze', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    if (!hasApiKey()) {
      return reply.code(409).send({ error: ANALYSIS_ERRORS.NO_API_KEY });
    }

    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length > MAX_ANALYZE_IDS) {
      return reply.code(400).send({ error: `Максимум ${MAX_ANALYZE_IDS} id за виклик` });
    }

    const criteria = getSavedCriteria(id)[req.body.mode];
    if (criteria.length === 0) {
      return reply.code(400).send({ error: ANALYSIS_ERRORS.NO_CRITERIA });
    }

    const listings = loadListings(id, ids);
    const descriptions = descriptionMap(listings);
    const model = req.body.model ?? DEFAULT_MODEL;

    const results: AnalyzedListing[] = [];
    const errors: string[] = [];

    for (const batch of chunk(listings, AUTO_CHUNK_SIZE)) {
      const prompt = buildMatchingPrompt(criteria, batch.map(toPromptListing), req.body.mode);
      try {
        const raw = await chat([{ role: 'user', content: prompt }], {
          model,
          reasoning: req.body.reasoning,
        });
        results.push(...parseMatchingResponse(raw, descriptions, criteria));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    const response: AnalyzeResponse = { results, errors };
    return response;
  });

  // Ручний пакет для безкоштовного чату: ZIP з prompt.txt + descriptions/chunk-NNN.json.
  app.get<{ Params: { id: string }; Querystring: { mode?: string; ids?: string } }>(
    '/api/searches/:id/analyze/package.zip',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
      if (!isMode(req.query.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });

      const ids = (req.query.ids ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter(Number.isFinite);

      const criteria = getSavedCriteria(id)[req.query.mode];
      if (criteria.length === 0) {
        return reply.code(400).send({ error: ANALYSIS_ERRORS.NO_CRITERIA });
      }

      const listings = loadListings(id, ids);
      const mode = req.query.mode;

      const archive = new ZipArchive();
      archive.on('error', (err: Error) => req.log.error(err));

      archive.append(buildManualZipInstructions(criteria, mode), { name: 'prompt.txt' });
      archive.append(readFileSync(ANALYZE_PY_PATH), { name: 'analyze.py' });
      archive.append(PATTERNS_EXAMPLE_JSON, { name: 'patterns.example.json' });
      chunk(listings, MANUAL_ZIP_CHUNK_SIZE).forEach((group, idx) => {
        const name = `descriptions/chunk-${String(idx + 1).padStart(3, '0')}.json`;
        const content = JSON.stringify(buildChunkListings(group.map(toPromptListing)), null, JSON_EXPORT_INDENT);
        archive.append(content, { name });
      });
      void archive.finalize();

      reply.header('Content-Disposition', `attachment; filename="analysis-${mode}-search-${id}.zip"`);
      reply.type(MIME_ZIP);
      return reply.send(archive);
    },
  );

  // Парс однієї вставленої відповіді matching + верифікація + мерж у накопичене.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; raw?: string; accumulated?: AnalyzedListing[] };
  }>('/api/searches/:id/analyze/import', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: ANALYSIS_ERRORS.BAD_MODE });
    if (!req.body.raw) return reply.code(400).send({ error: ANALYSIS_ERRORS.EMPTY_RESPONSE });

    const criteria = getSavedCriteria(id)[req.body.mode];
    const listings = loadListings(id, []);
    const descriptions = descriptionMap(listings);

    let parsed: AnalyzedListing[];
    try {
      parsed = parseMatchingResponse(req.body.raw, descriptions, criteria);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }

    const accumulated = Array.isArray(req.body.accumulated) ? req.body.accumulated : [];
    const merged = mergeResults(accumulated, parsed);
    const response: AnalyzeResponse = { results: merged, errors: [] };
    return response;
  });

  // Експорт превʼю (крок 3): xlsx | json.
  app.post<{
    Params: { id: string };
    Body: { format?: string; mode?: string; rows?: { title?: string; description?: string; criteria?: string[] }[] };
  }>('/api/searches/:id/analyze/export', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: ANALYSIS_ERRORS.SEARCH_NOT_FOUND });
    const mode: AnalysisMode = isMode(req.body.mode) ? req.body.mode : 'cons';
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const label = MODE_LABEL[mode];

    if (req.body.format === 'json') {
      reply.header('Content-Disposition', `attachment; filename="analysis-${mode}.json"`);
      reply.type(MIME_JSON);
      return JSON.stringify(rows, null, JSON_EXPORT_INDENT);
    }

    const buffer = await buildXlsxBuffer(
      label,
      [
        { header: 'Назва', key: 'title', width: PREVIEW_XLSX_WIDTHS.title },
        { header: 'Опис', key: 'description', width: PREVIEW_XLSX_WIDTHS.description },
        { header: label, key: 'criteria', width: PREVIEW_XLSX_WIDTHS.criteria },
      ],
      rows.map((r) => ({
        title: r.title ?? '',
        description: stripHtml(r.description ?? ''),
        criteria: (r.criteria ?? []).map((c) => `${BULLET_PREFIX}${c}`).join('\n'),
      })),
    );

    reply.header('Content-Disposition', `attachment; filename="analysis-${mode}.xlsx"`);
    reply.type(MIME_XLSX);
    return reply.send(buffer);
  });
}
