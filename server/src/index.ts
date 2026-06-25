import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDb } from './db/db.js';
import { searchesRoutes } from './routes/searches.js';
import { projectsRoutes } from './routes/projects.js';
import { listingsRoutes } from './routes/listings.js';
import { analysisRoutes } from './routes/analysis/index.js';
import { aiPicksRoutes } from './routes/aiPicks.js';
import { relevanceRoutes } from './routes/relevance.js';
import { searchSynonymsRoutes } from './routes/searchSynonyms.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
});

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
