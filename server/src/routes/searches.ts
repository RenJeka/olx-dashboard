import type { FastifyInstance } from 'fastify';
import { db } from '../db/db.js';
import {
  runScan,
  runVerify,
  countVerifyCandidates,
  analyzeScan,
  runDeepScanFromPlan,
  requestStopScan,
  isAnalysisFresh,
} from '../scanner.js';
import { evaluateFilteredOut } from '../scraper/localFilters.js';
import { getCategoryMap, resolveCategoryPath } from '../scraper/olxCategories.js';
import { parseBullets } from '../analysis/text.js';
import type {
  CategoryOption,
  FilterOptions,
  LocalFilters,
  ParamKeyInfo,
  ScanPlan,
  SearchStats,
} from '../types.js';

interface SearchBody {
  name?: string;
  query?: string;
  category_id?: number | null;
  api_filters?: unknown;
  local_filters?: unknown;
  cron_enabled?: number;
  /** Синоніми query (docs/plans/search-synonyms.md). */
  query_synonyms?: string[];
  /** Архів пошуку (docs/plans/archive-searches.md): 1 — в архіві. */
  archived?: number;
  /** Проект (docs/plans/projects.md): id проекту або null — «Без проекту». */
  project_id?: number | null;
}

/** api_filters/local_filters приймаємо як обʼєкт або рядок → зберігаємо як JSON-рядок. */
function toJsonText(value: unknown, fallback = '{}'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function searchesRoutes(app: FastifyInstance): Promise<void> {
  // Список пошуків
  app.get('/api/searches', async () => {
    return db
      .prepare('SELECT * FROM searches ORDER BY sort_order ASC, created_at DESC, id DESC')
      .all();
  });

  // Один пошук
  app.get<{ Params: { id: string } }>('/api/searches/:id', async (req, reply) => {
    const row = db
      .prepare('SELECT * FROM searches WHERE id = ?')
      .get(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: 'Пошук не знайдено' });
    return row;
  });

  // Створення
  app.post<{ Body: SearchBody }>('/api/searches', async (req, reply) => {
    const { name, query } = req.body;
    if (!name || !query) {
      return reply.code(400).send({ error: 'Поля name і query обовʼязкові' });
    }

    // Новий пошук з'являється згори списку.
    const { min } = db.prepare('SELECT MIN(sort_order) AS min FROM searches').get() as {
      min: number | null;
    };
    const sortOrder = (min ?? 0) - 1;

    const info = db
      .prepare(
        `INSERT INTO searches (name, query, category_id, api_filters, local_filters, cron_enabled, sort_order, query_synonyms, archived, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        name,
        query,
        req.body.category_id ?? null,
        toJsonText(req.body.api_filters),
        toJsonText(req.body.local_filters),
        req.body.cron_enabled ?? 0,
        sortOrder,
        toJsonText(req.body.query_synonyms, '[]'),
        req.body.archived ? 1 : 0,
        req.body.project_id ?? null,
      );

    return reply
      .code(201)
      .send(
        db
          .prepare('SELECT * FROM searches WHERE id = ?')
          .get(Number(info.lastInsertRowid)),
      );
  });

  // Оновлення
  app.patch<{ Params: { id: string }; Body: SearchBody }>(
    '/api/searches/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'Пошук не знайдено' });

      const fields: string[] = [];
      const values: unknown[] = [];

      if (req.body.name != null) {
        fields.push('name = ?');
        values.push(req.body.name);
      }
      if (req.body.query != null) {
        fields.push('query = ?');
        values.push(req.body.query);
      }
      if (req.body.category_id !== undefined) {
        fields.push('category_id = ?');
        values.push(req.body.category_id);
      }
      if (req.body.api_filters !== undefined) {
        fields.push('api_filters = ?');
        values.push(toJsonText(req.body.api_filters));
      }
      if (req.body.local_filters !== undefined) {
        fields.push('local_filters = ?');
        values.push(toJsonText(req.body.local_filters));
      }
      if (req.body.cron_enabled !== undefined) {
        fields.push('cron_enabled = ?');
        values.push(req.body.cron_enabled);
      }
      if (req.body.query_synonyms !== undefined) {
        fields.push('query_synonyms = ?');
        values.push(toJsonText(req.body.query_synonyms, '[]'));
      }
      if (req.body.archived !== undefined) {
        fields.push('archived = ?');
        values.push(req.body.archived ? 1 : 0);
      }
      if (req.body.project_id !== undefined) {
        fields.push('project_id = ?');
        values.push(req.body.project_id ?? null);
      }

      if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE searches SET ${fields.join(', ')} WHERE id = ?`).run(
          ...values,
        );
      }

      const search = db.prepare('SELECT * FROM searches WHERE id = ?').get(id);

      // Зміна local_filters → ретроактивний перерахунок filtered_out для всіх рядків пошуку.
      if (req.body.local_filters === undefined) return search;

      const { local_filters } = db.prepare('SELECT local_filters FROM searches WHERE id = ?').get(id) as {
        local_filters: string;
      };
      let localFilters: LocalFilters = {};
      try {
        localFilters = JSON.parse(local_filters || '{}') as LocalFilters;
      } catch {
        localFilters = {};
      }

      const listingRows = db
        .prepare('SELECT id, title, description, params, price, city, seller_name, pros, cons, category_id FROM listings WHERE search_id = ?')
        .all(id) as {
          id: number;
          title: string | null;
          description: string | null;
          params: string | null;
          price: number | null;
          city: string | null;
          seller_name: string | null;
          pros: string | null;
          cons: string | null;
          category_id: number | null;
        }[];

      const updateFilteredOut = db.prepare('UPDATE listings SET filtered_out = ? WHERE id = ?');
      const recompute = db.transaction((rows: typeof listingRows) => {
        let count = 0;
        for (const row of rows) {
          const filteredOut = evaluateFilteredOut(localFilters, row);
          if (filteredOut) count++;
          updateFilteredOut.run(filteredOut ? 1 : 0, row.id);
        }
        return count;
      });

      const filteredOutCount = recompute(listingRows);

      return { ...(search as object), filtered_out_count: filteredOutCount };
    },
  );

  // Видалення (каскадне: price_history → scan_runs → listings → searches)
  app.delete<{ Params: { id: string } }>(
    '/api/searches/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM searches WHERE id = ?').get(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Пошук не знайдено' });
      }

      const deleteCascade = db.transaction((searchId: number) => {
        db.prepare(
          `DELETE FROM price_history WHERE listing_id IN (SELECT id FROM listings WHERE search_id = ?)`,
        ).run(searchId);
        db.prepare('DELETE FROM scan_runs WHERE search_id = ?').run(searchId);
        db.prepare('DELETE FROM listings WHERE search_id = ?').run(searchId);
        db.prepare('DELETE FROM searches WHERE id = ?').run(searchId);
      });
      deleteCascade(id);

      return { deleted: true };
    },
  );

  // Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом за поточним порядком.
  app.post<{ Params: { id: string }; Body: { direction?: 'up' | 'down' } }>(
    '/api/searches/:id/move',
    async (req, reply) => {
      const id = Number(req.params.id);
      const direction = req.body.direction;
      if (direction !== 'up' && direction !== 'down') {
        return reply.code(400).send({ error: 'direction має бути "up" або "down"' });
      }

      const current = db
        .prepare('SELECT id, sort_order, project_id FROM searches WHERE id = ?')
        .get(id) as { id: number; sort_order: number; project_id: number | null } | undefined;
      if (!current) return reply.code(404).send({ error: 'Пошук не знайдено' });

      // Реордер лише серед активних (не архівних) у межах ТІЄЇ Ж групи-проекту
      // (project_id збігається; NULL = група «Без проекту»).
      const sameProject = '(project_id = ? OR (? IS NULL AND project_id IS NULL))';
      const neighbor = (
        direction === 'up'
          ? db.prepare(
              `SELECT id, sort_order FROM searches WHERE sort_order < ? AND archived = 0 AND ${sameProject} ORDER BY sort_order DESC LIMIT 1`,
            )
          : db.prepare(
              `SELECT id, sort_order FROM searches WHERE sort_order > ? AND archived = 0 AND ${sameProject} ORDER BY sort_order ASC LIMIT 1`,
            )
      ).get(current.sort_order, current.project_id, current.project_id) as
        | { id: number; sort_order: number }
        | undefined;

      if (neighbor) {
        const swap = db.transaction(
          (a: { id: number; sort_order: number }, b: { id: number; sort_order: number }) => {
            const update = db.prepare('UPDATE searches SET sort_order = ? WHERE id = ?');
            update.run(b.sort_order, a.id);
            update.run(a.sort_order, b.id);
          },
        );
        swap(current, neighbor);
      }

      return db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
    },
  );

  // Сканування. ?deep=true — глибокий скан (батчі з паузами, до ~50 запитів).
  app.post<{ Params: { id: string }; Querystring: { deep?: string } }>(
    '/api/searches/:id/scan',
    async (req, reply) => {
      const id = Number(req.params.id);
      const deep = req.query.deep === 'true';
      try {
        const result = await runScan(id, { deep });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'Помилка сканування');
        return reply.code(500).send({ error: message });
      }
    },
  );

  // Аналітична (probe) фаза двофазного глибокого скану (docs/plans/two-phase-deep-scan.md):
  // root + межі ціни + бісекція по кожному варіанту query, БЕЗ допагінації листів. Повертає
  // звіт ScanPlan для ScanPlanReportDialog; план кешується на сервері під planToken.
  app.post<{ Params: { id: string }; Querystring: { deep?: string } }>(
    '/api/searches/:id/scan/analyze',
    async (req, reply) => {
      const id = Number(req.params.id);
      try {
        const plan = await analyzeScan(id, { deep: req.query.deep === 'true' });
        return plan;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'Помилка аналітичної фази глибокого скану');
        return reply.code(500).send({ error: message });
      }
    },
  );

  // Запуск повного глибокого скану за раніше зібраним планом (без повторного зондування).
  app.post<{ Params: { id: string }; Body: { planToken?: string } }>(
    '/api/searches/:id/scan/run-plan',
    async (req, reply) => {
      const id = Number(req.params.id);
      const planToken = req.body.planToken;
      if (!planToken) return reply.code(400).send({ error: 'planToken обовʼязковий' });
      try {
        const result = await runDeepScanFromPlan(id, planToken);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isStale = message.includes('застарів');
        app.log.error({ err }, 'Помилка запуску скану за планом');
        return reply.code(isStale ? 410 : 500).send({ error: message });
      }
    },
  );

  // Зупинка активного скану (docs/plans/deep-scan-stop-and-history.md): ставить abort-прапорець,
  // активний скан завершиться частковим успіхом і збереже вже зібране у БД.
  app.post<{ Params: { id: string } }>('/api/searches/:id/scan/stop', async (req) => {
    const id = Number(req.params.id);
    const stopped = requestStopScan(id);
    return { stopped };
  });

  // Verify-прохід (A3): перевірка живості давно не бачених + дозаповнення опису/продавця.
  app.post<{ Params: { id: string } }>('/api/searches/:id/verify', async (req, reply) => {
    const id = Number(req.params.id);
    const search = db.prepare('SELECT id FROM searches WHERE id = ?').get(id);
    if (!search) return reply.code(404).send({ error: 'Пошук не знайдено' });
    try {
      const result = await runVerify(id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err }, 'Помилка verify-проходу');
      return reply.code(500).send({ error: message });
    }
  });

  // Статус останнього скану — для поллінгу прогресу глибокого скану.
  app.get<{ Params: { id: string } }>(
    '/api/searches/:id/scan-status',
    async (req, reply) => {
      const id = Number(req.params.id);
      const row = db
        .prepare(
          `SELECT id, started_at, finished_at, found, new_count, raw_found, error, requests_done, requests_total,
                  fetch_method, kind, stage, sub_done, sub_total
           FROM scan_runs WHERE search_id = ? ORDER BY id DESC LIMIT 1`,
        )
        .get(id);
      if (!row) return reply.code(404).send({ error: 'Сканів ще не було' });
      return row;
    },
  );

  // Останній збережений аналіз (kind='analyze') — для перегляду без повторного зондування
  // (docs/plans/deep-scan-stop-and-history.md). planValid — часова валідність (у межах TTL за
  // finished_at): true → звіт ще запускний (за потреби runDeepScanFromPlan перезондує);
  // false → аналіз протермінований, потрібен новий.
  app.get<{ Params: { id: string } }>(
    '/api/searches/:id/last-analysis',
    async (req, reply) => {
      const id = Number(req.params.id);
      const row = db
        .prepare(
          `SELECT finished_at, scan_plan FROM scan_runs
           WHERE search_id = ? AND kind = 'analyze' AND scan_plan IS NOT NULL
           ORDER BY id DESC LIMIT 1`,
        )
        .get(id) as { finished_at: string | null; scan_plan: string } | undefined;

      if (!row) return reply.code(404).send({ error: 'Аналізів ще не було' });

      let plan: ScanPlan;
      try {
        plan = JSON.parse(row.scan_plan) as ScanPlan;
      } catch {
        return reply.code(404).send({ error: 'Збережений аналіз пошкоджено' });
      }

      return {
        plan,
        analyzedAt: row.finished_at,
        // Валідність — часова (у межах TTL за finished_at), НЕ прив'язана до in-memory кешу:
        // звіт лишається запускним протягом TTL навіть після закриття діалогу/перезапуску
        // сервера (runDeepScanFromPlan за потреби перезондує).
        planValid: isAnalysisFresh(row.finished_at),
      };
    },
  );

  // Розподіл усіх ключів params цього пошуку (для дропдауна конструктора діапазонів).
  app.get<{ Params: { id: string } }>('/api/searches/:id/param-keys', async (req) => {
    const id = Number(req.params.id);
    const rows = db
      .prepare("SELECT params FROM listings WHERE search_id = ? AND params IS NOT NULL AND params != '{}'")
      .all(id) as { params: string }[];

    const samplesByKey = new Map<string, string[]>();
    for (const row of rows) {
      let params: Record<string, string>;
      try {
        params = JSON.parse(row.params) as Record<string, string>;
      } catch {
        continue;
      }
      for (const [key, value] of Object.entries(params)) {
        if (!samplesByKey.has(key)) samplesByKey.set(key, []);
        const samples = samplesByKey.get(key) as string[];
        if (samples.length < 3 && !samples.includes(value)) samples.push(value);
      }
    }

    const result: ParamKeyInfo[] = Array.from(samplesByKey.entries())
      .map(([key, samples]) => ({ key, samples }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return result;
  });

  // Варіанти для фільтрів "Місто"/"Продавець"/"Плюси"/"Мінуси" (Drawer локальних фільтрів).
  // Плюси/мінуси — DISTINCT критерії з реальних рядків (враховує ручний едіт, не лише analysis_criteria).
  app.get<{ Params: { id: string } }>('/api/searches/:id/filter-options', async (req) => {
    const id = Number(req.params.id);

    const cityRows = db
      .prepare(
        "SELECT DISTINCT city FROM listings WHERE search_id = ? AND city IS NOT NULL AND city != '' ORDER BY city ASC",
      )
      .all(id) as { city: string }[];

    const sellerRows = db
      .prepare(
        "SELECT DISTINCT seller_name FROM listings WHERE search_id = ? AND seller_name IS NOT NULL AND seller_name != '' ORDER BY seller_name ASC",
      )
      .all(id) as { seller_name: string }[];

    // Унікальні критерії плюсів/мінусів — DISTINCT із рядків listings, парсинг bullet-тексту.
    const prosRows = db
      .prepare("SELECT pros FROM listings WHERE search_id = ? AND pros IS NOT NULL AND pros != ''")
      .all(id) as { pros: string }[];
    const consRows = db
      .prepare("SELECT cons FROM listings WHERE search_id = ? AND cons IS NOT NULL AND cons != ''")
      .all(id) as { cons: string }[];

    const prosSet = new Set<string>();
    for (const row of prosRows) parseBullets(row.pros).forEach((c) => prosSet.add(c));
    const consSet = new Set<string>();
    for (const row of consRows) parseBullets(row.cons).forEach((c) => consSet.add(c));

    // Категорії, наявні в пошуку: distinct листові category_id + слаг для fallback-назви.
    // Лічильники тут НЕ рахуємо — їх дає фронт із уже завантаженого масиву listings.
    const categoryRows = db
      .prepare(
        'SELECT DISTINCT category_id, category_type FROM listings WHERE search_id = ? AND category_id IS NOT NULL',
      )
      .all(id) as { category_id: number; category_type: string | null }[];

    const categoryMap = await getCategoryMap();
    const categories: CategoryOption[] = categoryRows
      .map((r) => ({
        id: r.category_id,
        path: resolveCategoryPath(categoryMap, r.category_id, r.category_type ?? undefined),
      }))
      .sort((a, b) => a.path.join(' / ').localeCompare(b.path.join(' / '), 'uk'));

    const result: FilterOptions = {
      cities: cityRows.map((r) => r.city),
      sellers: sellerRows.map((r) => r.seller_name),
      pros: [...prosSet].sort(),
      cons: [...consSet].sort(),
      categories,
    };
    return result;
  });

  // Статистика для панелі дій: скільки в базі, скільки "давно не бачених", останній скан.
  app.get<{ Params: { id: string } }>('/api/searches/:id/stats', async (req, reply) => {
    const id = Number(req.params.id);
    const search = db.prepare('SELECT id FROM searches WHERE id = ?').get(id);
    if (!search) return reply.code(404).send({ error: 'Пошук не знайдено' });

    const { in_db } = db
      .prepare('SELECT COUNT(*) AS in_db FROM listings WHERE search_id = ?')
      .get(id) as { in_db: number };

    const { stale_count } = db
      .prepare(
        `SELECT COUNT(*) AS stale_count FROM listings
         WHERE search_id = ? AND status_source = 'auto' AND last_seen_at < datetime('now', '-3 days')`,
      )
      .get(id) as { stale_count: number };

    const lastScan = db
      .prepare(
        `SELECT kind, started_at, finished_at, found, new_count, raw_found, disabled_count, error, warning
         FROM scan_runs WHERE search_id = ? AND kind != 'analyze' ORDER BY id DESC LIMIT 1`,
      )
      .get(id) as SearchStats['last_scan'] | undefined;

    const verify_candidates = countVerifyCandidates(id);

    const stats: SearchStats = { in_db, stale_count, verify_candidates, last_scan: lastScan ?? null };
    return stats;
  });
}
