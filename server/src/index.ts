import './env.js'; // завантажити server/.env у process.env ДО читання auth/БД конфігів
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDb } from './db/db.js';
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

const PORT = Number(process.env.PORT ?? 3001);

// Fail-fast: не піднімати сервер з відкритим гейтом (auth on, але немає ключів).
assertAuthConfigured();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
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

app.get('/health', async () => ({ ok: true }));

try {
  await initDb(); // застосувати схему ДО прийому запитів (Turso/нова локальна БД — порожні)
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
