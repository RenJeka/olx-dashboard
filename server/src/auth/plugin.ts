// Auth-plugin: реєструє cookie+jwt на КОРЕНЕВОМУ інстансі (через fastify-plugin, без
// інкапсуляції — інакше глобальний хук/декоратори не побачать сусідні роути) і ставить
// onRequest-замок на всі /api/* окрім /api/auth/* та /health.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { createRemoteJWKSet, jwtVerify } from 'jose';
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

  const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
  const audience: string = clientId; // звужений (clientId вже не null після guard вище)

  // Чому не google-auth-library.verifyIdToken: на Node воно завжди тягне legacy PEM-сертифікати
  // з www.googleapis.com/oauth2/v1/certs (Google віддає 403). А середовище Render не дістає й
  // JWK-хоста www.googleapis.com (jose: "Expected 200 OK from the JWK Set").
  //
  // Тому ПЕРВИННО — tokeninfo на ІНШОМУ хості oauth2.googleapis.com (OAuth-інфраструктура,
  // досяжна з Render): Google сам перевіряє підпис, ми валідуємо aud/iss/email_verified.
  // ЗАПАСНО — локальна перевірка через jose+JWKS (працює там, де www.googleapis.com досяжний).

  /** tokeninfo повертає всі поля рядками (email_verified="true", aud="…"). */
  async function emailViaTokeninfo(credential: string): Promise<string> {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { headers: { 'User-Agent': 'olx-dashboard' } },
    );
    if (!res.ok) throw new Error(`tokeninfo HTTP ${res.status}`);
    const info = (await res.json()) as Record<string, string | undefined>;
    if (info.aud !== audience) throw new Error('Невірний audience Google-токена.');
    if (!info.iss || !GOOGLE_ISSUERS.includes(info.iss)) {
      throw new Error('Невірний issuer Google-токена.');
    }
    if (!info.email || info.email_verified !== 'true') {
      throw new Error('Google-акаунт без верифікованого email.');
    }
    return info.email;
  }

  const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  async function emailViaJwks(credential: string): Promise<string> {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    if (typeof payload.email !== 'string' || payload.email_verified !== true) {
      throw new Error('Google-акаунт без верифікованого email.');
    }
    return payload.email;
  }

  app.decorate('verifyGoogleIdToken', async (credential: string): Promise<string> => {
    let email: string;
    try {
      email = await emailViaTokeninfo(credential);
    } catch (err) {
      app.log.warn({ err: (err as Error).message }, 'tokeninfo verify failed — fallback to JWKS');
      email = await emailViaJwks(credential);
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
