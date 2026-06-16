import Fastify from 'fastify';
import cors from '@fastify/cors';
import { searchesRoutes } from './routes/searches.js';
import { listingsRoutes } from './routes/listings.js';
import { analysisRoutes } from './routes/analysis/index.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: ['http://localhost:5173'],
});

await app.register(searchesRoutes);
await app.register(listingsRoutes);
await app.register(analysisRoutes);

app.get('/health', async () => ({ ok: true }));

try {
  await app.listen({ port: PORT, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
