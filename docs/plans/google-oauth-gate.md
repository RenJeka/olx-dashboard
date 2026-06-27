# Google OAuth «ворота» — single-user gate доступу

> Статус: **У РОБОТІ**.

## Контекст (навіщо)

Застосунок не має жодної авторизації — усі `/api/*` відкриті, немає сесій/кукі/користувачів.
CLAUDE.md фіксує продукт як «Single-user, локальний запуск». Мета — виставити дашборд на
**публічний хостинг (Render: фронт — Static Site, API — окремий сервіс)** і пускати **лише
власника** через Google-логін.

**Це НЕ перехід у мультикористувацький режим.** Жодної таблиці `users`, жодного `user_id` у
даних, жодного партиціонування — single-user інваріант лишається. Google OAuth тут — тільки
**замок** на вході + сесійна кукі. Доступ контролюється allowlist email у `.env`
(`ALLOWED_EMAILS`).

**Наслідки публічного деплою:** фронт і API на різних доменах → cross-site кукі
(`SameSite=None; Secure`), CORS з `credentials: true` й явним `origin` (не `*`), домени
прописані в Google Cloud Console (Authorized JavaScript origins).

## Потік

1. Фронт показує гейт-екран із кнопкою Google (`@react-oauth/google`, GIS) → ID-token (JWT).
2. `POST /api/auth/google { credential }` (`credentials: 'include'`).
3. Сервер верифікує ID-token (`google-auth-library`, `verifyIdToken`, `aud === GOOGLE_CLIENT_ID`,
   підпис, exp) → `email`/`email_verified`.
4. `email` ∈ `ALLOWED_EMAILS` і верифікований → підписуємо власний сесійний JWT (`@fastify/jwt`),
   кладемо в httpOnly-кукі (`olx_session`). Інакше → `403`.
5. Глобальний `preHandler`-хук на `/api/*` (окрім `/api/auth/*`, `/health`) → `jwtVerify()` з
   кукі, інакше `401`.
6. Фронт при старті: `GET /api/auth/me` → `200` показує застосунок, `401` → гейт. Глобальний
   перехоплювач `401` у fetch-обгортці повертає на гейт.

Сесія — **stateless JWT у кукі** (без БД), TTL ~30 днів. `POST /api/auth/logout` чистить кукі.

## Залежності (нові, узгоджені)

- `server/`: `@fastify/cookie`, `@fastify/jwt`, `google-auth-library`.
- `web/`: `@react-oauth/google` (роутер НЕ потрібен — гейт через умовний рендер у `App.tsx`).

## Файли

| Файл | Тип правок |
|---|---|
| `server/src/auth/config.ts` | НОВИЙ — env: `GOOGLE_CLIENT_ID`, `getAllowedEmails()`, `SESSION_SECRET`, кукі-флаги, `isAuthDisabled()` |
| `server/src/auth/plugin.ts` | НОВИЙ — реєстрація `@fastify/cookie`/`@fastify/jwt`, декоратор verify Google, глобальний `preHandler` |
| `server/src/auth/routes.ts` | НОВИЙ — `POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout` |
| `server/src/index.ts` | `import './env.js'` перший; реєстрація `authPlugin` ДО доменних роутів; CORS `credentials: true` |
| `server/.env.example` | секція Auth |
| `server/package.json` | 3 нові залежності |
| `web/src/api/base.ts` | `credentials: 'include'` + обробка `401` |
| `web/src/auth/useAuth.ts` | НОВИЙ — TanStack Query `me`/`login`/`logout` |
| `web/src/auth/AuthGate.tsx` | НОВИЙ — гейт-екран + `<GoogleLogin>` |
| `web/src/main.tsx` | `<GoogleOAuthProvider>` |
| `web/src/App.tsx` | обгортка `<AuthGate>` |
| `web/src/components/Header.tsx` | кнопка «Вийти» (опційно) |
| `web/.env.example` | НОВИЙ — `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE` |
| `web/package.json` | 1 нова залежність |

**Схему БД НЕ чіпати.**

## Кукі-флаги

- Прод (cross-site): `httpOnly, secure: true, sameSite: 'none', path: '/'`.
- Локал (http): `secure: false, sameSite: 'lax'`.
- Керування через `AUTH_COOKIE_SECURE` (дефолт `true`).

## Локальний режим

`AUTH_DISABLED=true` (тільки локально) → хук пропускає все, `/api/auth/me` повертає
`{ email: 'local@dev' }`. Дефолт — auth увімкнено. Для проду прапор має бути відсутній/`false`.
Якщо auth увімкнено, але `GOOGLE_CLIENT_ID`/`SESSION_SECRET` відсутні → fail-fast при старті.

## Кроки

- [ ] `docs/plans/google-oauth-gate.md` (цей файл) — першим.
- [ ] `server/`: deps + `auth/{config,plugin,routes}.ts` + `index.ts` + `.env.example`.
- [ ] `web/`: deps + `auth/{useAuth,AuthGate}.tsx` + `base.ts` + `main.tsx` + `App.tsx` + `.env.example`.
- [ ] `docs/architecture.md` + `docs/structure.md` — нові модулі/ендпойнти/залежності.
- [ ] `npm run build` зелений; smoke-тест гейта (нижче).

## Test-cases

1. **`AUTH_DISABLED=true`** → дашборд відкривається як раніше (регрес немає).
2. **Auth on, локал:** :5173 → гейт; логін своїм Google → пускає, `GET /api/auth/me` = `200`,
   кукі `olx_session` стоїть; reload — лишаємось залогінені; «Вийти» → знову гейт.
3. **Негатив:** email поза `ALLOWED_EMAILS` → `403`; `curl /api/searches` без кукі → `401`;
   `/health` без кукі → `200`.
4. **Анти-підробка:** сміттєвий `credential` у `/api/auth/google` → `401/403`, сесії немає.
5. **Прод:** `AUTH_COOKIE_SECURE=true`, cross-site кукі `SameSite=None; Secure`; інкогніто без
   логіну → API `401`.
6. `npm run build` (server tsc + web tsc/vite) без помилок типів.
