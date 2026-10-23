import type { FastifyInstance } from 'fastify';
import {
  runScan,
  runVerify,
  analyzeScan,
  runDeepScanFromPlan,
  requestStopScan,
} from '../scanner/index.js';
import {
  assertSearchExists,
  createSearch,
  deleteSearch,
  getFilterOptions,
  getLastAnalysis,
  getParamKeys,
  getScanStatus,
  getSearch,
  getSearchStats,
  listAllSearches,
  moveSearch,
  updateSearch,
  type SearchInput,
} from '../services/searches.js';

// Помилки сервісу (404/400) відповідає глобальний обробник (routes/errorHandler.ts). Скан-роути
// мають власний catch: збій скану вже записано в журнал у withScanRun — без подвійного запису.
export async function searchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/searches', () => listAllSearches());

  app.get<{ Params: { id: string } }>('/api/searches/:id', (req) => getSearch(Number(req.params.id)));

  app.post<{ Body: SearchInput }>('/api/searches', async (req, reply) => {
    return reply.code(201).send(await createSearch(req.body));
  });

  app.patch<{ Params: { id: string }; Body: SearchInput }>('/api/searches/:id', (req) =>
    updateSearch(Number(req.params.id), req.body),
  );

  // Видалення (каскадне: price_history → scan_runs → listings → searches)
  app.delete<{ Params: { id: string } }>('/api/searches/:id', (req) => deleteSearch(Number(req.params.id)));

  // Ручне сортування (стрілки ↑/↓): міняє sort_order із сусідом за поточним порядком.
  app.post<{ Params: { id: string }; Body: { direction?: 'up' | 'down' } }>('/api/searches/:id/move', (req) =>
    moveSearch(Number(req.params.id), req.body.direction),
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

  // Аналітична (probe) фаза двофазного глибокого скану (docs/plans/old/two-phase-deep-scan.md):
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

  // Зупинка активного скану (docs/plans/old/deep-scan-stop-and-history.md): ставить abort-прапорець,
  // активний скан завершиться частковим успіхом і збереже вже зібране у БД.
  app.post<{ Params: { id: string } }>('/api/searches/:id/scan/stop', async (req) => {
    const id = Number(req.params.id);
    const stopped = requestStopScan(id);
    return { stopped };
  });

  // Verify-прохід (A3): перевірка живості давно не бачених + дозаповнення опису/продавця.
  app.post<{ Params: { id: string } }>('/api/searches/:id/verify', async (req, reply) => {
    const id = Number(req.params.id);
    await assertSearchExists(id);
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
  app.get<{ Params: { id: string } }>('/api/searches/:id/scan-status', (req) =>
    getScanStatus(Number(req.params.id)),
  );

  // Останній збережений аналіз (kind='analyze') — для перегляду без повторного зондування.
  app.get<{ Params: { id: string } }>('/api/searches/:id/last-analysis', (req) =>
    getLastAnalysis(Number(req.params.id)),
  );

  // Розподіл усіх ключів params цього пошуку (для дропдауна конструктора діапазонів).
  app.get<{ Params: { id: string } }>('/api/searches/:id/param-keys', (req) => getParamKeys(Number(req.params.id)));

  // Варіанти для фільтрів "Місто"/"Продавець"/"Плюси"/"Мінуси"/"Категорії" (Drawer локальних фільтрів).
  app.get<{ Params: { id: string } }>('/api/searches/:id/filter-options', (req) =>
    getFilterOptions(Number(req.params.id)),
  );

  // Останній скан для панелі дій (агрегати рахує фронт — див. getSearchStats).
  app.get<{ Params: { id: string } }>('/api/searches/:id/stats', (req) => getSearchStats(Number(req.params.id)));
}
