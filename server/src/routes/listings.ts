import type { FastifyInstance } from 'fastify';
import type { InValue } from '@libsql/client';
import { dbAll, dbGet, dbRun } from '../db/db.js';
import { descriptionPreview, matchesQuery, stripHtml } from '../analysis/text.js';
import { LISTING_STATUSES, type ListingPatch } from '../types.js';

// Білий список колонок для сортування (захист від SQL-інʼєкцій).
const SORTABLE = new Set([
  'price',
  'title',
  'city',
  'posted_at',
  'first_seen_at',
  'last_seen_at',
]);

// Легкий рядок таблиці (docs/plans/old/listings-light-payload.md): без повного опису й галереї — вони
// найважчі у відповіді великого пошуку (пам'ять API, S14). Опис — лише початок (`description_head`),
// з якого сервер робить фрагмент для колонки; повний опис і `photo_urls` — `/details` на вимогу.
const DESCRIPTION_HEAD_CHARS = 600;
const DESCRIPTION_PREVIEW_CHARS = 240;
/** Максимум id в одному запиті деталей (AI-майстер просить описи пакетом). */
const DETAILS_MAX_IDS = 500;
/** Пошук в описі читає рядки порціями — повні описи пошуку не тримаються в пам'яті разом. */
const SEARCH_CHUNK = 1000;

const LISTING_COLUMNS = `id, olx_id, search_id, title, url, price, currency, city, district,
                category_id, category_type,
                photo_url, substr(description, 1, ${DESCRIPTION_HEAD_CHARS}) AS description_head,
                seller_name, contact_name, olx_status,
                status, status_source, note, pros, cons, filtered_out, miss_count,
                analysis_at, analysis_source, analysis_model, analysis_stale,
                ai_rank, ai_pick_reason, ai_ranked_at,
                ai_relevant, ai_relevant_reason, ai_relevant_at, ai_relevant_source,
                posted_at, first_seen_at, last_seen_at`;

type LightRowRaw = Record<string, unknown> & { description_head: string | null };

/** `description_head` → `description_preview` + `has_description`. */
function toLightRow({ description_head, ...row }: LightRowRaw) {
  const description_preview = descriptionPreview(description_head, DESCRIPTION_PREVIEW_CHARS);
  return { ...row, description_preview, has_description: description_preview != null };
}

// ТИМЧАСОВО (S17, docs/plans/s17-timing.md): заміри етапів великого пошуку — прибрати після висновку.
// CPU-час — на весь процес (паралельні запити додаються), але порівняння з загальним часом показує,
// сервер рахує чи чекає.
const ms = (since: number): number => Math.round(performance.now() - since);
function perfTotals(): () => { totalMs: number; cpuMs: number } {
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  return () => {
    const cpu = process.cpuUsage(cpu0);
    return { totalMs: ms(t0), cpuMs: Math.round((cpu.user + cpu.system) / 1000) };
  };
}

export async function listingsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { id: string };
    Querystring: { sort?: string; order?: string };
  }>('/api/searches/:id/listings', async (req, reply) => {
    const searchId = Number(req.params.id);
    const totals = perfTotals();

    const sort = SORTABLE.has(req.query.sort ?? '')
      ? (req.query.sort as string)
      : 'first_seen_at';
    const order = req.query.order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let t = performance.now();
    const rows = await dbAll<LightRowRaw>(
      `SELECT ${LISTING_COLUMNS}
         FROM listings
         WHERE search_id = ?
         ORDER BY ${sort} ${order}`,
      [searchId],
    );
    const tursoMs = ms(t);
    t = performance.now();
    const light = rows.map(toLightRow);
    const mapMs = ms(t);
    t = performance.now();
    const body = JSON.stringify(light);
    const jsonMs = ms(t);
    req.log.info(
      {
        scope: 'perf',
        route: 'listings',
        searchId,
        rows: rows.length,
        tursoMs,
        mapMs,
        jsonMs,
        bytes: Buffer.byteLength(body),
        ...totals(),
      },
      'S17 timing',
    );
    return reply.type('application/json; charset=utf-8').send(body);
  });

  // Повний опис і галерея одного оголошення — на вимогу (підказка, діалог, галерея).
  app.get<{ Params: { id: string } }>('/api/listings/:id/details', async (req, reply) => {
    const row = await dbGet('SELECT id, description, photo_urls FROM listings WHERE id = ?', [
      Number(req.params.id),
    ]);
    if (!row) return reply.code(404).send({ error: 'Оголошення не знайдено' });
    return row;
  });

  // Те саме пакетом (крок перегляду AI-майстра) — лише рядки цього пошуку.
  app.post<{ Params: { id: string }; Body: { ids?: unknown } }>(
    '/api/searches/:id/listings/details',
    async (req, reply) => {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map(Number).filter((n) => Number.isInteger(n))
        : [];
      if (ids.length > DETAILS_MAX_IDS) {
        return reply.code(400).send({ error: `Забагато id (максимум ${DETAILS_MAX_IDS})` });
      }
      if (ids.length === 0) return [];
      return dbAll(
        `SELECT id, description, photo_urls FROM listings
           WHERE search_id = ? AND id IN (${ids.map(() => '?').join(', ')})`,
        [Number(req.params.id), ...ids],
      );
    },
  );

  // Пошук у назві та/або описі (булевий запит, як у таблиці) → id збігів. Опис не віддається
  // на клієнт, тож пошук в описі — тут; рядки читаються порціями за id.
  app.get<{
    Params: { id: string };
    Querystring: { q?: string; title?: string; description?: string };
  }>('/api/searches/:id/listings/search', async (req) => {
    const searchId = Number(req.params.id);
    const query = (req.query.q ?? '').trim();
    const inTitle = req.query.title !== '0';
    const inDescription = req.query.description !== '0';
    if (!query || (!inTitle && !inDescription)) return { ids: [] };

    const totals = perfTotals();
    let tursoMs = 0;
    let matchMs = 0;
    let chunks = 0;
    let rowsRead = 0;
    const ids: number[] = [];
    let lastId = 0;
    for (;;) {
      let t = performance.now();
      const chunk = await dbAll<{ id: number; title: string | null; description: string | null }>(
        `SELECT id, title, description FROM listings
           WHERE search_id = ? AND id > ? ORDER BY id LIMIT ${SEARCH_CHUNK}`,
        [searchId, lastId],
      );
      tursoMs += performance.now() - t;
      t = performance.now();
      chunks += 1;
      rowsRead += chunk.length;
      for (const row of chunk) {
        const parts: string[] = [];
        if (inTitle) parts.push((row.title ?? '').toLowerCase());
        if (inDescription) parts.push(stripHtml(row.description).toLowerCase());
        if (matchesQuery(parts.join('\n'), query)) ids.push(row.id);
      }
      matchMs += performance.now() - t;
      const last = chunk.at(-1);
      if (!last || chunk.length < SEARCH_CHUNK) break;
      lastId = last.id;
    }
    req.log.info(
      {
        scope: 'perf',
        route: 'listings/search',
        searchId,
        inDescription,
        chunks,
        rows: rowsRead,
        matches: ids.length,
        tursoMs: Math.round(tursoMs),
        matchMs: Math.round(matchMs),
        ...totals(),
      },
      'S17 timing',
    );
    return { ids };
  });

  // Ручна зміна статусу/нотатки. Будь-яка зміна статусу → status_source='manual', miss_count=0.
  app.patch<{ Params: { id: string }; Body: ListingPatch }>(
    '/api/listings/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = await dbGet('SELECT id FROM listings WHERE id = ?', [id]);
      if (!existing) return reply.code(404).send({ error: 'Оголошення не знайдено' });

      const { status, note, pros, cons, ai_relevant, olx_status } = req.body;

      if (status !== undefined && !LISTING_STATUSES.includes(status)) {
        return reply.code(400).send({ error: `Невідомий статус: ${status}` });
      }

      // Ручний override «Активності» — лише фіксований набір або null («невідоме»).
      if (
        olx_status !== undefined &&
        olx_status !== null &&
        !['active', 'inactive', 'removed'].includes(olx_status)
      ) {
        return reply.code(400).send({ error: `Невідоме значення olx_status: ${olx_status}` });
      }

      const fields: string[] = [];
      const values: InValue[] = [];

      if (status !== undefined) {
        fields.push("status = ?", "status_source = 'manual'", 'miss_count = 0');
        values.push(status);
      }
      if (note !== undefined) {
        fields.push('note = ?');
        values.push(note);
      }
      if (pros !== undefined) {
        fields.push('pros = ?');
        values.push(pros);
      }
      if (cons !== undefined) {
        fields.push('cons = ?');
        values.push(cons);
      }
      // Ручний override семантичного фільтра: позначаємо source='manual', щоб авто-прогін не перетер.
      if (ai_relevant !== undefined) {
        fields.push(
          'ai_relevant = ?',
          "ai_relevant_source = 'manual'",
          "ai_relevant_at = datetime('now')",
        );
        values.push(ai_relevant === null ? null : ai_relevant ? 1 : 0);
      }
      // Разова підказка — БЕЗ source-захисту (скан/verify перепише, коли побачить оголошення).
      if (olx_status !== undefined) {
        fields.push('olx_status = ?');
        values.push(olx_status);
      }

      if (fields.length > 0) {
        values.push(id);
        await dbRun(`UPDATE listings SET ${fields.join(', ')} WHERE id = ?`, values);
      }

      const updated = await dbGet<LightRowRaw>(`SELECT ${LISTING_COLUMNS} FROM listings WHERE id = ?`, [id]);
      return updated && toLightRow(updated);
    },
  );
}
