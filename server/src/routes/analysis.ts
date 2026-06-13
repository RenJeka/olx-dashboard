import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import {
  AUTO_CHUNK_SIZE,
  DEFAULT_MODEL,
  MANUAL_PACKAGE_TOKEN_CAP,
  MAX_ANALYZE_IDS,
  hasApiKey,
} from '../analysis/config.js';
import { chat } from '../analysis/openrouter.js';
import {
  buildCriteriaPrompt,
  buildMatchingPrompt,
  pickSample,
  type PromptListing,
} from '../analysis/prompts.js';
import { mergeResults, parseCriteriaResponse, parseMatchingResponse } from '../analysis/parse.js';
import { estimateTokens, stripHtml } from '../analysis/text.js';
import { buildXlsxBuffer } from '../export/xlsx.js';
import type {
  AnalysisMode,
  AnalyzeResponse,
  AnalyzedListing,
  CommitItem,
  PackagePart,
} from '../types.js';

interface ListingRow {
  id: number;
  title: string | null;
  description: string | null;
  params: string | null;
}

const MODE_LABEL: Record<AnalysisMode, string> = { cons: 'Мінуси', pros: 'Плюси' };

function isMode(value: unknown): value is AnalysisMode {
  return value === 'cons' || value === 'pros';
}

function getSearch(id: number): { id: number; name: string; analysis_criteria: string } | undefined {
  return db.prepare('SELECT id, name, analysis_criteria FROM searches WHERE id = ?').get(id) as
    | { id: number; name: string; analysis_criteria: string }
    | undefined;
}

function getSavedCriteria(searchId: number): { cons: string[]; pros: string[] } {
  const row = db.prepare('SELECT analysis_criteria FROM searches WHERE id = ?').get(searchId) as
    | { analysis_criteria: string }
    | undefined;
  try {
    const parsed = JSON.parse(row?.analysis_criteria || '{}') as { cons?: string[]; pros?: string[] };
    return { cons: parsed.cons ?? [], pros: parsed.pros ?? [] };
  } catch {
    return { cons: [], pros: [] };
  }
}

/** Завантажує оголошення за id (або всі пошуку, якщо ids порожній). */
function loadListings(searchId: number, ids: number[]): ListingRow[] {
  if (ids.length === 0) {
    return db
      .prepare('SELECT id, title, description, params FROM listings WHERE search_id = ?')
      .all(searchId) as ListingRow[];
  }
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT id, title, description, params FROM listings WHERE search_id = ? AND id IN (${placeholders})`,
    )
    .all(searchId, ...ids) as ListingRow[];
}

function toPromptListing(row: ListingRow): PromptListing {
  return { id: row.id, title: row.title, description: row.description, params: row.params };
}

function descriptionMap(rows: ListingRow[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const row of rows) map.set(row.id, stripHtml(row.description));
  return map;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  // ── A1: статус ──────────────────────────────────────────────────────────
  app.get('/api/analysis/status', async () => {
    return { apiAvailable: hasApiKey(), defaultModel: DEFAULT_MODEL };
  });

  // ── A4: критерії ──────────────────────────────────────────────────────────

  // Збережені критерії пошуку.
  app.get<{ Params: { id: string } }>('/api/searches/:id/criteria', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: 'Пошук не знайдено' });
    return getSavedCriteria(id);
  });

  // Генерація критеріїв (авто). Без ключа → 409.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; sampleSize?: number; model?: string; reasoning?: boolean; extra?: string };
  }>('/api/searches/:id/criteria/generate', async (req, reply) => {
    const id = Number(req.params.id);
    const search = getSearch(id);
    if (!search) return reply.code(404).send({ error: 'Пошук не знайдено' });
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: 'mode має бути cons|pros' });
    if (!hasApiKey()) {
      return reply.code(409).send({ error: 'Авто-режим недоступний: немає OPENROUTER_API_KEY' });
    }

    const listings = loadListings(id, []);
    const sample = pickSample(listings, req.body.sampleSize ?? 30);
    const prompt = buildCriteriaPrompt(
      search.name,
      sample.map((l) => l.description ?? ''),
      req.body.mode,
      req.body.extra,
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
      const search = getSearch(id);
      if (!search) return reply.code(404).send({ error: 'Пошук не знайдено' });
      if (!isMode(req.query.mode)) return reply.code(400).send({ error: 'mode має бути cons|pros' });

      const listings = loadListings(id, []);
      const sample = pickSample(listings, 30);
      const prompt = buildCriteriaPrompt(
        search.name,
        sample.map((l) => l.description ?? ''),
        req.query.mode,
        req.query.extra,
      );
      return { prompt };
    },
  );

  // Парс вставленої відповіді LLM з критеріями (ручний). НЕ зберігає.
  app.post<{ Params: { id: string }; Body: { mode?: string; raw?: string } }>(
    '/api/searches/:id/criteria/import',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: 'Пошук не знайдено' });
      if (!req.body.raw) return reply.code(400).send({ error: 'Порожня відповідь' });
      try {
        return { criteria: parseCriteriaResponse(req.body.raw) };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // Зберегти обрані критерії пошуку.
  app.put<{ Params: { id: string }; Body: { cons?: string[]; pros?: string[] } }>(
    '/api/searches/:id/criteria',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: 'Пошук не знайдено' });

      const current = getSavedCriteria(id);
      const next = {
        cons: Array.isArray(req.body.cons) ? req.body.cons : current.cons,
        pros: Array.isArray(req.body.pros) ? req.body.pros : current.pros,
      };
      db.prepare('UPDATE searches SET analysis_criteria = ? WHERE id = ?').run(JSON.stringify(next), id);
      return next;
    },
  );

  // ── A5: matching ────────────────────────────────────────────────────────

  // Авто matching (чанки по AUTO_CHUNK_SIZE). НЕ пише в БД.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; ids?: number[]; model?: string; reasoning?: boolean };
  }>('/api/searches/:id/analyze', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: 'Пошук не знайдено' });
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: 'mode має бути cons|pros' });
    if (!hasApiKey()) {
      return reply.code(409).send({ error: 'Авто-режим недоступний: немає OPENROUTER_API_KEY' });
    }

    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length > MAX_ANALYZE_IDS) {
      return reply.code(400).send({ error: `Максимум ${MAX_ANALYZE_IDS} id за виклик` });
    }

    const criteria = getSavedCriteria(id)[req.body.mode];
    if (criteria.length === 0) {
      return reply.code(400).send({ error: 'Спершу збережіть критерії пошуку' });
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

  // Ручний пакет для безкоштовного чату (авто-вибір 1 vs кілька частин).
  app.get<{ Params: { id: string }; Querystring: { mode?: string; ids?: string } }>(
    '/api/searches/:id/analyze/package',
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!getSearch(id)) return reply.code(404).send({ error: 'Пошук не знайдено' });
      if (!isMode(req.query.mode)) return reply.code(400).send({ error: 'mode має бути cons|pros' });

      const ids = (req.query.ids ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter(Number.isFinite);

      const criteria = getSavedCriteria(id)[req.query.mode];
      if (criteria.length === 0) {
        return reply.code(400).send({ error: 'Спершу збережіть критерії пошуку' });
      }

      const listings = loadListings(id, ids);
      const mode = req.query.mode;

      // Оцінюємо повний промпт; якщо вкладається у поріг — один файл, інакше ділимо.
      const fullPrompt = buildMatchingPrompt(criteria, listings.map(toPromptListing), mode);
      const parts: PackagePart[] = [];

      if (estimateTokens(fullPrompt) <= MANUAL_PACKAGE_TOKEN_CAP || listings.length <= 1) {
        parts.push({ name: `${mode}-аналіз.txt`, content: fullPrompt });
      } else {
        // Розбиваємо оголошення на групи з оцінкою токенів ≤ cap.
        const groups: ListingRow[][] = [];
        let curr: ListingRow[] = [];
        for (const l of listings) {
          const trial = buildMatchingPrompt(criteria, [...curr, l].map(toPromptListing), mode);
          if (curr.length > 0 && estimateTokens(trial) > MANUAL_PACKAGE_TOKEN_CAP) {
            groups.push(curr);
            curr = [l];
          } else {
            curr.push(l);
          }
        }
        if (curr.length > 0) groups.push(curr);

        groups.forEach((group, idx) => {
          const header = `# Частина ${idx + 1}/${groups.length}\n\n`;
          parts.push({
            name: `${mode}-аналіз-частина-${idx + 1}.txt`,
            content: header + buildMatchingPrompt(criteria, group.map(toPromptListing), mode),
          });
        });
      }

      return { parts };
    },
  );

  // Парс однієї вставленої відповіді matching + верифікація + мерж у накопичене.
  app.post<{
    Params: { id: string };
    Body: { mode?: string; raw?: string; accumulated?: AnalyzedListing[] };
  }>('/api/searches/:id/analyze/import', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: 'Пошук не знайдено' });
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: 'mode має бути cons|pros' });
    if (!req.body.raw) return reply.code(400).send({ error: 'Порожня відповідь' });

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

  // Експорт превʼю (крок 3): xlsx | json. rows: [{title, description, criteria}].
  app.post<{
    Params: { id: string };
    Body: { format?: string; mode?: string; rows?: { title?: string; description?: string; criteria?: string[] }[] };
  }>('/api/searches/:id/analyze/export', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getSearch(id)) return reply.code(404).send({ error: 'Пошук не знайдено' });
    const mode: AnalysisMode = isMode(req.body.mode) ? req.body.mode : 'cons';
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const label = MODE_LABEL[mode];

    if (req.body.format === 'json') {
      reply.header('Content-Disposition', `attachment; filename="analysis-${mode}.json"`);
      reply.type('application/json');
      return JSON.stringify(rows, null, 2);
    }

    const buffer = await buildXlsxBuffer(
      label,
      [
        { header: 'Назва', key: 'title', width: 40 },
        { header: 'Опис', key: 'description', width: 60 },
        { header: label, key: 'criteria', width: 40 },
      ],
      rows.map((r) => ({
        title: r.title ?? '',
        description: stripHtml(r.description ?? ''),
        criteria: (r.criteria ?? []).map((c) => `• ${c}`).join('\n'),
      })),
    );

    reply.header(
      'Content-Disposition',
      `attachment; filename="analysis-${mode}.xlsx"`,
    );
    reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return reply.send(buffer);
  });

  // ── Commit: запис у БД (chunked з боку клієнта) ──────────────────────────
  app.post<{
    Body: { mode?: string; items?: CommitItem[]; model?: string; source?: string };
  }>('/api/listings/analyze/commit', async (req, reply) => {
    if (!isMode(req.body.mode)) return reply.code(400).send({ error: 'mode має бути cons|pros' });
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const source = req.body.source === 'api' ? 'api' : 'import';
    const model = req.body.model ?? (source === 'import' ? 'manual' : DEFAULT_MODEL);
    const column = req.body.mode; // 'cons' | 'pros' — безпечно (whitelist через isMode)

    const stmt = db.prepare(
      `UPDATE listings SET ${column} = ?, analysis_at = datetime('now'),
              analysis_source = ?, analysis_model = ?, analysis_stale = 0
       WHERE id = ?`,
    );

    const run = db.transaction((rows: CommitItem[]) => {
      let updated = 0;
      for (const row of rows) {
        const text = row.criteria.length > 0 ? row.criteria.map((c) => `• ${c}`).join('\n') : '';
        const info = stmt.run(text, source, model, row.id);
        updated += info.changes;
      }
      return updated;
    });

    const updated = run(items);
    return { updated };
  });
}
