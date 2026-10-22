import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logError } from '../logger.js';

/**
 * Глобальний перехоплювач невпійманих помилок роутів: у журнал app_logs зі stage=метод+URL,
 * відповідь — той самий формат {error}, що й у ручних reply.code(500) по роутах.
 * Код — `statusCode` помилки (Fastify-валідація, `HttpError` з `errors.ts`), інакше 500.
 */
export function httpErrorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  const status = err.statusCode ?? 500;
  // 4xx (валідація/404 від Fastify) — очікувані, у журнал не пишемо; 5xx — пишемо зі stack.
  if (status >= 500) {
    logError('http', `${req.method} ${req.url}`, err);
  }
  reply.code(status).send({ error: err.message });
}
