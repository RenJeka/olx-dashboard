import './env.js'; // завантажити server/.env у process.env ДО читання auth/БД конфігів
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { initDb } from './db/db.js';
import { rootLogger, logError, logWarn, cleanupOldLogs } from './logger.js';
import { closeInterruptedScanRuns } from './scanner/scanRunLifecycle.js';
import { authPlugin } from './auth/plugin.js';
import { authRoutes } from './auth/routes.js';
import { assertAuthConfigured } from './auth/config.js';
import { searchesRoutes } from './routes/searches.js';
import { projectsRoutes } from './routes/projects.js';
import { listingsRoutes } from './routes/listings.js';
import { analysisRoutes } from './routes/analysis/index.js';
import { aiPicksRoutes } from './routes/aiPicks.js';
import { relevanceRoutes } from './routes/relevance.js';
import { searchSynonymsRoutes } from './routes/searchSynonyms.js';
import { logsRoutes } from './routes/logs.js';

const PORT = Number(process.env.PORT ?? 3001);

// Fail-fast: не піднімати сервер з відкритим гейтом (auth on, але немає ключів).
assertAuthConfigured();

// Наш кореневий pino замість вбудованого (docs/plans/logging-system.md):
// HTTP-логи Fastify і записи logError/logWarn ідуть одним потоком/форматом.
const app = Fastify({ loggerInstance: rootLogger });

// Глобальний перехоплювач невпійманих помилок роутів: у журнал app_logs зі stage=метод+URL,
// відповідь — той самий формат {error}, що й у ручних reply.code(500) по роутах.
app.setErrorHandler((err: FastifyError, req, reply) => {
  const status = err.statusCode ?? 500;
  // 4xx (валідація/404 від Fastify) — очікувані, у журнал не пишемо; 5xx — пишемо зі stack.
  if (status >= 500) {
    logError('http', `${req.method} ${req.url}`, err);
  }
  reply.code(status).send({ error: err.message });
});

// Аварії process-рівня: у журнал (fire-and-forget встигає, бо процес живе далі / коротка пауза).
process.on('unhandledRejection', (reason) => {
  logError('process', 'unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  logError('process', 'uncaughtException', err);
  // Стан процесу після uncaught невизначений — виходимо, давши мить на запис журналу.
  setTimeout(() => process.exit(1), 300);
});

await app.register(cors, {
  // || замість ?? — порожній рядок (WEB_ORIGIN=) теж замінюється дефолтом.
  origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  credentials: true, // cross-site сесійна кукі (фронт і API на різних доменах)
});

// Auth ДО доменних роутів: глобальний замок має покривати всі /api/*.
await app.register(authPlugin);
await app.register(authRoutes);

await app.register(searchesRoutes);
await app.register(projectsRoutes);
await app.register(listingsRoutes);
await app.register(analysisRoutes);
await app.register(aiPicksRoutes);
await app.register(relevanceRoutes);
await app.register(searchSynonymsRoutes);
await app.register(logsRoutes);

app.get('/health', async () => ({ ok: true }));

try {
  // застосувати схему ДО прийому запитів (Turso/нова локальна БД — порожні) + автоміграція колонок
  for (const sql of await initDb()) app.log.info(`Міграція схеми: ${sql}`);
  await cleanupOldLogs(); // retention журналу app_logs (старші за 14 днів)
  // скани, обірвані разом із попереднім процесом (засинання/рестарт), — закрити, а не лишати «вічними»
  const interrupted = await closeInterruptedScanRuns();
  if (interrupted > 0) {
    logWarn('scanner', 'startup', `Закрито обірваних сканів: ${interrupted} (процес зупинявся посеред скану)`);
  }
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
