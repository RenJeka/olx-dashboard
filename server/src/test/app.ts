import Fastify, { type FastifyInstance } from 'fastify';
import { httpErrorHandler } from '../routes/errorHandler.js';

/** Fastify для тестів роутів — з тим самим обробником помилок, що й прод (index.ts). */
export function testApp(): FastifyInstance {
  const app = Fastify();
  app.setErrorHandler(httpErrorHandler);
  return app;
}
