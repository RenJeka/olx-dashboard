// Ендпойнти авторизації. /api/auth/* виключені з глобального замка (plugin.ts), тож
// /me верифікує сесію самостійно.
import type { FastifyInstance } from 'fastify';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  isAuthDisabled,
  sessionCookieOptions,
} from './config.js';

interface GoogleBody {
  credential?: string;
}

// Фейкова сесія для локального обходу (AUTH_DISABLED=true).
const LOCAL_SESSION = { email: 'local@dev' };

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Обмін Google ID-token на сесійну кукі.
  app.post<{ Body: GoogleBody }>('/api/auth/google', async (req, reply) => {
    if (isAuthDisabled()) return reply.send(LOCAL_SESSION);

    const credential = req.body?.credential?.trim();
    if (!credential) return reply.code(400).send({ error: 'Поле credential обовʼязкове' });

    let email: string;
    try {
      email = await app.verifyGoogleIdToken(credential);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 401;
      const msg = (err as Error).message ?? String(err);
      req.log.warn({ status, err: msg }, 'Google token verify failed');
      return reply.code(status).send({ error: msg });
    }

    const token = app.jwt.sign({ email }, { expiresIn: SESSION_TTL_SECONDS });
    reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return reply.send({ email });
  });

  // Поточна сесія (для гейта на фронті).
  app.get('/api/auth/me', async (req, reply) => {
    if (isAuthDisabled()) return reply.send(LOCAL_SESSION);
    try {
      const { email } = await req.jwtVerify<{ email: string }>();
      return reply.send({ email });
    } catch (err) {
      req.log.debug({ err: (err as Error).message }, 'JWT verify failed on /me');
      return reply.code(401).send({ error: 'Не авторизовано' });
    }
  });

  // Вихід — чистимо кукі.
  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });
}
