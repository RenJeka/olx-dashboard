import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import {
  ANALYSIS_ERRORS,
  DEFAULT_MODEL,
  JSON_EXPORT_INDENT,
  MANUAL_ZIP_CHUNK_SIZE,
  MAX_ANALYZE_IDS,
} from '../analysis/constants.js';
import { requireApiKey, requireSearch } from '../analysis/guards.js';
import { ZIP_EMPTY_RESULT, ZIP_FILES, numberedFile } from '../analysis/manualZip.js';
import {
  buildRelevanceZipInstructions,
  parseRelevanceResponse,
  prefilterCandidates,
  runRelevance,
} from '../analysis/relevance.js';
import { runJevRelevance } from '../analysis/jevEngine.js';
import { buildChunkListings } from '../analysis/prompts.js';
import {
  RELEVANCE_MERGE_PY_PATH,
  RELEVANCE_VERIFY_PY_PATH,
  chunk,
  toPromptListing,
} from '../analysis/promptData.js';
import {
  getRelevanceAliases,
  getRelevanceTarget,
  loadListings,
  setRelevanceTarget,
  commitRelevance,
} from '../db/repos/analysis.js';
import { BadRequestError, errorMessage } from '../errors.js';
import { getLogger } from '../logger.js';
import type { RelevanceItem, RelevanceResponse } from '../types.js';
import { parseIds, sendZip, type ZipEntry } from './http.js';

/** Цільовий товар із тіла запиту (з фолбеком на збережений/query). */
async function resolveTarget(searchId: number, raw?: string): Promise<string> {
  const trimmed = (raw ?? '').trim();
  return trimmed || (await getRelevanceTarget(searchId));
}

export async function relevanceRoutes(app: FastifyInstance): Promise<void> {
  // Цільовий товар (передзаповнюється query, якщо ще не збережений).
  app.get<{ Params: { id: string } }>('/api/searches/:id/relevance/target', async (req) => {
    const { id } = await requireSearch(Number(req.params.id));
    return { target: await getRelevanceTarget(id) };
  });

  app.put<{ Params: { id: string }; Body: { target?: string } }>(
    '/api/searches/:id/relevance/target',
    async (req) => {
      const { id } = await requireSearch(Number(req.params.id));
      await setRelevanceTarget(id, (req.body.target ?? '').trim());
      return { target: await getRelevanceTarget(id) };
    },
  );

  // Превʼю розбивки пре-фільтра (для UI): скільки піде в ШІ, скільки авто-відсіється. НЕ пише в БД.
  app.post<{ Params: { id: string }; Body: { target?: string; ids?: number[] } }>(
    '/api/searches/:id/relevance/preview',
    async (req) => {
      const { id } = await requireSearch(Number(req.params.id));
      const target = await resolveTarget(id, req.body.target);
      const aliases = await getRelevanceAliases(id);
      const listings = await loadListings(id, parseIds(req.body.ids));
      const { candidates, rejected } = prefilterCandidates(target, listings.map(toPromptListing), aliases);
      return { total: listings.length, candidates: candidates.length, autoRejected: rejected.length };
    },
  );

  // Авто-класифікація (чанки LLM або пул Jev на сервері). НЕ пише в БД.
  app.post<{
    Params: { id: string };
    Body: { target?: string; ids?: number[]; model?: string; engine?: string };
  }>('/api/searches/:id/relevance/analyze', async (req, reply) => {
    const { id } = await requireSearch(Number(req.params.id));
    requireApiKey();

    const target = await resolveTarget(id, req.body.target);
    if (!target) throw new BadRequestError(ANALYSIS_ERRORS.NO_TARGET);
    const aliases = await getRelevanceAliases(id);

    const ids = parseIds(req.body.ids);
    if (ids.length > MAX_ANALYZE_IDS) throw new BadRequestError(ANALYSIS_ERRORS.TOO_MANY_IDS);

    const listings = await loadListings(id, ids);
    try {
      if (req.body.engine === 'jev') {
        const result = await runJevRelevance(target, listings.map(toPromptListing), aliases);
        getLogger('relevance').info({ searchId: id, model: result.model, usage: result.usage }, 'Jev: прогін релевантності');
        return result satisfies RelevanceResponse;
      }
      const result = await runRelevance(
        target,
        listings.map(toPromptListing),
        req.body.model ?? DEFAULT_MODEL,
        aliases,
      );
      return result satisfies RelevanceResponse;
    } catch (err) {
      return reply.code(500).send({ error: errorMessage(err) });
    }
  });

  // Ручний ZIP-пакет: prompt.txt + descriptions/chunk-NNN.json (без analyze.py).
  app.post<{ Params: { id: string }; Body: { target?: string; ids?: number[] } }>(
    '/api/searches/:id/relevance/package.zip',
    async (req, reply) => {
      const { id } = await requireSearch(Number(req.params.id));

      const target = await resolveTarget(id, req.body.target);
      if (!target) throw new BadRequestError(ANALYSIS_ERRORS.NO_TARGET);
      const aliases = await getRelevanceAliases(id);

      const listings = await loadListings(id, parseIds(req.body.ids));
      // У ZIP кладемо лише кандидатів (відсіяні евристикою додаються при import).
      const { candidates } = prefilterCandidates(target, listings.map(toPromptListing), aliases);

      const entries: ZipEntry[] = [
        { name: ZIP_FILES.PROMPT, content: buildRelevanceZipInstructions(target, aliases) },
        { name: ZIP_FILES.MERGE_PY, content: readFileSync(RELEVANCE_MERGE_PY_PATH) },
        { name: ZIP_FILES.VERIFY_PY, content: readFileSync(RELEVANCE_VERIFY_PY_PATH) },
      ];
      chunk(candidates, MANUAL_ZIP_CHUNK_SIZE).forEach((group, idx) => {
        entries.push({
          name: numberedFile(ZIP_FILES.DESCRIPTIONS, idx),
          content: JSON.stringify(buildChunkListings(group), null, JSON_EXPORT_INDENT),
        });
        // Порожня заготовка проміжного файлу-класифікації на КОЖЕН чанк: слабкій моделі легше
        // заповнити наявний файл (гарантована назва/шлях, видно чек-лист), ніж створювати з нуля;
        // незаповнені (`[]`) спіймає verify.py як БРАКУЄ id (як у AI Вибір, docs/ai-flow.md).
        entries.push({ name: numberedFile(ZIP_FILES.CLASSIFICATIONS, idx), content: ZIP_EMPTY_RESULT });
      });
      return sendZip(req, reply, `relevance-search-${id}.zip`, entries);
    },
  );

  // Парс вставленої відповіді + мерж у накопичене (за id). НЕ пише в БД.
  // ids — той самий scope, що й у package.zip: на ньому проганяємо пре-фільтр, щоб відсіяні
  // евристикою (їх немає у ZIP/відповіді) теж потрапили у результат як relevant=false.
  app.post<{
    Params: { id: string };
    Body: { raw?: string; accumulated?: RelevanceItem[]; ids?: number[]; target?: string };
  }>('/api/searches/:id/relevance/import', async (req, reply) => {
    const { id } = await requireSearch(Number(req.params.id));
    if (!req.body.raw) throw new BadRequestError(ANALYSIS_ERRORS.EMPTY_RESPONSE);

    const target = await resolveTarget(id, req.body.target);
    const aliases = await getRelevanceAliases(id);
    const listings = await loadListings(id, parseIds(req.body.ids));
    const { rejected } = prefilterCandidates(target, listings.map(toPromptListing), aliases);
    const validIds = listings.map((l) => l.id);

    let parsed: RelevanceItem[];
    try {
      parsed = parseRelevanceResponse(req.body.raw, validIds);
    } catch (err) {
      return reply.code(400).send({ error: errorMessage(err) });
    }

    // Порядок мержу: накопичене → евристичні відсіяні → вердикти ШІ (останні перемагають).
    const byId = new Map<number, RelevanceItem>();
    for (const item of Array.isArray(req.body.accumulated) ? req.body.accumulated : []) {
      byId.set(item.id, item);
    }
    for (const item of rejected) byId.set(item.id, item);
    for (const item of parsed) byId.set(item.id, item);

    const response: RelevanceResponse = { results: Array.from(byId.values()), errors: [] };
    return response;
  });

  // Commit: UPDATE ai_relevant/* у транзакції. Ручні override (source='manual') НЕ перетираємо.
  app.post<{
    Params: { id: string };
    Body: { items?: RelevanceItem[]; source?: string };
  }>('/api/searches/:id/relevance/commit', async (req) => {
    const { id } = await requireSearch(Number(req.params.id));

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const source = req.body.source === 'import' ? 'import' : 'api';

    // Транзакція в репозиторії; ручні override (source='manual') не перетираються.
    return { committed: await commitRelevance(id, items, source) };
  });
}
