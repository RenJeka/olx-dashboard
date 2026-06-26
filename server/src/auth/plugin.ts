// Auth-plugin: реєструє cookie+jwt на КОРЕНЕВОМУ інстансі (через fastify-plugin, без
// інкапсуляції — інакше глобальний хук/декоратори не побачать сусідні роути) і ставить
// onRequest-замок на всі /api/* окрім /api/auth/* та /health.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { OAuth2Client } from 'google-auth-library';
import {
  SESSION_COOKIE_NAME,
  getGoogleClientId,
  getSessionSecret,
  isAuthDisabled,
  isEmailAllowed,
} from './config.js';

/** Розширення типів Fastify: декоратор верифікації Google ID-token. */
declare module 'fastify' {
  interface FastifyInstance {
    /** Верифікує Google ID-token, повертає дозволений email або кидає помилку. */
    verifyGoogleIdToken(credential: string): Promise<string>;
  }
  interface FastifyJWT {
    payload: { email: string };
    user: { email: string };
  }
}

async function authPluginImpl(app: FastifyInstance): Promise<void> {
  // Локальний обхід — нічого не реєструємо, замок не ставимо.
  if (isAuthDisabled()) {
    app.log.warn('AUTH_DISABLED=true — авторизація вимкнена (лише для локального dev).');
    return;
  }

  const clientId = getGoogleClientId();
  const secret = getSessionSecret();
  // assertAuthConfigured() в index.ts вже гарантує наявність — тут лише звужуємо типи.
  if (!clientId || !secret) throw new Error('Auth misconfigured: clientId/secret відсутні.');

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret,
    cookie: { cookieName: SESSION_COOKIE_NAME, signed: false },
  });

  const googleClient = new OAuth2Client(clientId);

  app.decorate('verifyGoogleIdToken', async (credential: string): Promise<string> => {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const email = payload?.email;
    if (!email || payload?.email_verified !== true) {
      throw new Error('Google-акаунт без верифікованого email.');
    }
    if (!isEmailAllowed(email)) {
      const err = new Error('Доступ заборонено для цього акаунта.');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }
    return email;
  });

  // Глобальний замок: пропускаємо CORS-preflight, /health і /api/auth/*; решта /api/* — лише з сесією.
  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    const url = request.raw.url ?? '';
    if (request.method === 'OPTIONS') return;
    if (url === '/health' || url.startsWith('/api/auth/')) return;
    if (!url.startsWith('/api/')) return;
    try {
      await request.jwtVerify();
    } catch (err) {
      request.log.debug({ url, err: (err as Error).message }, 'JWT verify failed — 401');
      return reply.code(401).send({ error: 'Не авторизовано' });
    }
  });
}

export const authPlugin = fp(authPluginImpl, { name: 'auth-plugin' });
