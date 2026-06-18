import { ZipArchive } from 'archiver';
import type { FastifyInstance } from 'fastify';
import { hasApiKey } from '../analysis/config.js';
import {
  DEFAULT_MODEL,
  JSON_EXPORT_INDENT,
  MANUAL_ZIP_CHUNK_SIZE,
  MAX_ANALYZE_IDS,
  MIME_ZIP,
} from '../analysis/constants.js';
import {
  buildRelevanceZipInstructions,
  parseRelevanceResponse,
  runRelevance,
} from '../analysis/relevance.js';
import { buildChunkListings } from '../analysis/prompts.js';
import { chunk, toPromptListing } from '../analysis/promptData.js';
import {
  getRelevanceTarget,
  getSearch,
  loadListings,
  setRelevanceTarget,
} from '../analysis/repo.js';
import { db } from '../db/db.js';
import type { RelevanceItem, RelevanceResponse } from '../types.js';

const SEARCH_NOT_FOUND = 'Пошук не знайдено';
const NO_API_KEY = 'Авто-режим недоступний: немає OPENROUTER_API_KEY';
const EMPTY_RESPONSE = 'Порожня відповідь';
const NO_TARGET = 'Вкажіть цільовий товар';

/** Цільовий товар із тіла запиту (з фолбеком на збережений/query). */
function resolveTarget(searchId: number, raw?: string): string {
  const trimmed = (raw ?? '').trim();
  return trimmed || getRelevanceTarget(searchId);
}

export async function relevanceRoutes(app: FastifyInstance): Promise<void> {
  // Цільовий товар (передзаповнюється query, якщо ще не збережений).
  app.get<{ Params: { id: string } }>('/api/searches/:id/relevance/target', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
    return { target: getRelevanceTarget(id) };
  });

  app.put<{ Params: { id: string }; Body: { target?: string } }>(
    '/api/searches/:id/relevance/target',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
      setRelevanceTarget(id, (req.body.target ?? '').trim());
      return { target: getRelevanceTarget(id) };
    },
  );

  // Авто-класифікація (чанки на сервері). НЕ пише в БД.
  app.post<{
    Params: { id: string };
    Body: { target?: string; ids?: number[]; model?: string };
  }>('/api/searches/:id/relevance/analyze', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
    if (!hasApiKey()) return reply.code(409).send({ error: NO_API_KEY });

    const target = resolveTarget(id, req.body.target);
    if (!target) return reply.code(400).send({ error: NO_TARGET });

    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length > MAX_ANALYZE_IDS) {
      return reply.code(400).send({ error: `Максимум ${MAX_ANALYZE_IDS} id за виклик` });
    }

    const listings = loadListings(id, ids);
    try {
      const result = await runRelevance(target, listings.map(toPromptListing), req.body.model ?? DEFAULT_MODEL);
      return result satisfies RelevanceResponse;
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Ручний ZIP-пакет: prompt.txt + descriptions/chunk-NNN.json (без analyze.py).
  app.post<{ Params: { id: string }; Body: { target?: string; ids?: number[] } }>(
    '/api/searches/:id/relevance/package.zip',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });

      const target = resolveTarget(id, req.body.target);
      if (!target) return reply.code(400).send({ error: NO_TARGET });

      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
      const listings = loadListings(id, ids);

      const archive = new ZipArchive();
      archive.on('error', (err: Error) => req.log.error(err));

      archive.append(buildRelevanceZipInstructions(target), { name: 'prompt.txt' });
      chunk(listings, MANUAL_ZIP_CHUNK_SIZE).forEach((group, idx) => {
        const name = `descriptions/chunk-${String(idx + 1).padStart(3, '0')}.json`;
        const content = JSON.stringify(buildChunkListings(group.map(toPromptListing)), null, JSON_EXPORT_INDENT);
        archive.append(content, { name });
      });
      void archive.finalize();

      reply.header('Content-Disposition', `attachment; filename="relevance-search-${id}.zip"`);
      reply.type(MIME_ZIP);
      return reply.send(archive);
    },
  );

  // Парс вставленої відповіді + мерж у накопичене (за id). НЕ пише в БД.
  app.post<{
    Params: { id: string };
    Body: { raw?: string; accumulated?: RelevanceItem[] };
  }>('/api/searches/:id/relevance/import', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });
    if (!req.body.raw) return reply.code(400).send({ error: EMPTY_RESPONSE });

    const validIds = loadListings(id, []).map((l) => l.id);

    let parsed: RelevanceItem[];
    try {
      parsed = parseRelevanceResponse(req.body.raw, validIds);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }

    const byId = new Map<number, RelevanceItem>();
    for (const item of Array.isArray(req.body.accumulated) ? req.body.accumulated : []) {
      byId.set(item.id, item);
    }
    for (const item of parsed) byId.set(item.id, item);

    const response: RelevanceResponse = { results: Array.from(byId.values()), errors: [] };
    return response;
  });

  // Commit: UPDATE ai_relevant/* у транзакції. Ручні override (source='manual') НЕ перетираємо.
  app.post<{
    Params: { id: string };
    Body: { items?: RelevanceItem[]; source?: string };
  }>('/api/searches/:id/relevance/commit', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: SEARCH_NOT_FOUND });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const source = req.body.source === 'import' ? 'import' : 'api';

    const setStmt = db.prepare(
      `UPDATE listings
       SET ai_relevant = ?, ai_relevant_reason = ?, ai_relevant_at = datetime('now'), ai_relevant_source = ?
       WHERE id = ? AND search_id = ? AND (ai_relevant_source IS NULL OR ai_relevant_source != 'manual')`,
    );

    const run = db.transaction(() => {
      let committed = 0;
      for (const item of items) {
        const info = setStmt.run(item.relevant ? 1 : 0, item.reason, source, item.id, id);
        committed += info.changes;
      }
      return committed;
    });

    return { committed: run() };
  });
}
