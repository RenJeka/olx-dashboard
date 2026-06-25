// Конфіг Google OAuth «воріт»: читання server/.env (патерн analysis/config.ts).
// Auth — замок на одного власника (allowlist email), а не мультиюзер: жодних users/user_id.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// server/.env (config.ts лежить у server/src/auth → піднятись на 2 рівні до server/).
const ENV_PATH = join(__dirname, '..', '..', '.env');

try {
  process.loadEnvFile(ENV_PATH);
} catch {
  // .env відсутній або недоступний — значення беремо з process.env (Render env) або дефолтів.
}

/** Назва httpOnly-кукі сесії. */
export const SESSION_COOKIE_NAME = 'olx_session';

/** Час життя сесійного JWT (секунди). 30 днів — рідкий ре-логін для персонального інструмента. */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Локальний обхід авторизації (тільки для dev): хук пропускає все, /api/auth/me віддає
 * фейкову сесію. Для проду цей прапор має бути відсутній/false.
 */
export function isAuthDisabled(): boolean {
  return process.env.AUTH_DISABLED === 'true';
}

/** OAuth 2.0 Client ID із Google Cloud Console (Web application). */
export function getGoogleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

/** Секрет для підпису власного сесійного JWT. */
export function getSessionSecret(): string | null {
  return process.env.SESSION_SECRET?.trim() || null;
}

/** Allowlist email (comma-sep) — кого пускаємо. Нормалізовано: lowercase + trim. */
export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Чи дозволений конкретний email (порожній allowlist → нікого, fail-closed). */
export function isEmailAllowed(email: string): boolean {
  const allowed = getAllowedEmails();
  return allowed.length > 0 && allowed.includes(email.trim().toLowerCase());
}

/**
 * Secure-кукі. Дефолт — true (безпечно для проду). Локально по http виставити
 * AUTH_COOKIE_SECURE=false, інакше браузер відкине кукі.
 */
export function isCookieSecure(): boolean {
  return process.env.AUTH_COOKIE_SECURE !== 'false';
}

/**
 * Опції кукі. Прод (cross-site Render): Secure + SameSite=None. Локал (http): SameSite=Lax
 * (None+Secure не працює по http). httpOnly завжди — JS не читає токен.
 */
export function sessionCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: '/';
  maxAge: number;
} {
  const secure = isCookieSecure();
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

/**
 * Fail-fast при старті: якщо auth увімкнено, але немає GOOGLE_CLIENT_ID/SESSION_SECRET —
 * це відкритий гейт. Кидаємо помилку, щоб сервер не піднявся з діркою в безпеці.
 */
export function assertAuthConfigured(): void {
  if (isAuthDisabled()) return;
  const missing: string[] = [];
  if (!getGoogleClientId()) missing.push('GOOGLE_CLIENT_ID');
  if (!getSessionSecret()) missing.push('SESSION_SECRET');
  if (getAllowedEmails().length === 0) missing.push('ALLOWED_EMAILS');
  if (missing.length > 0) {
    throw new Error(
      `Auth увімкнено, але відсутні: ${missing.join(', ')}. ` +
        `Заповніть server/.env або виставте AUTH_DISABLED=true для локального запуску без логіну.`,
    );
  }
}
