# Налаштування Google OAuth (single-user gate)

Авторизація реалізована як **замок на одного власника**: лише твій Google-акаунт отримує
доступ. Дані не партиціонуються — це не мультиюзер, просто захист від відкритого доступу в
інтернеті.

---

## 1. Google Cloud Console — створити OAuth Client ID

> Це одноразовий ручний крок. Займає ~5 хвилин.

1. Відкрий [Google Cloud Console](https://console.cloud.google.com/) і увійди під своїм акаунтом.

2. **Створи або обери проект.** У верхньому лівому куті → випадаючий список проектів →
   «New Project» → назви (наприклад `olx-dashboard`) → Create.

3. **Увімкни Google Identity API:**
   Меню (☰) → «APIs & Services» → «Library» → знайди `Identity Toolkit API` (або `OAuth`) →
   **Enable**. (Насправді для GIS / ID-token flow вмикати окремо не обов'язково — API
   автоматично дозволений під час створення credentials, але не завадить.)

4. **Налаштуй OAuth consent screen:**
   «APIs & Services» → «OAuth consent screen» → вибери **External** (або Internal якщо у
   Google Workspace) → Fill in required fields:
   - App name: `OLX Dashboard`
   - User support email: своя пошта
   - Developer contact: своя пошта
   - Усе інше — можна пропустити → Save and Continue → Save and Continue → Back to Dashboard.

   > ⚠️ Publishing status: лишити **Testing** (not published). Додати свій email у
   > «Test users» → Save. Так обійдеш верифікацію Google для особистого інструмента.

5. **Створи OAuth 2.0 Client ID:**
   «APIs & Services» → «Credentials» → «+ Create Credentials» → «OAuth client ID» →

   - Application type: **Web application**
   - Name: `olx-dashboard-web`
   - **Authorized JavaScript origins** — додай усі домени, звідки буде відкриватися дашборд:
     ```
     http://localhost:5173
     https://<твій-фронтенд>.onrender.com
     ```
     > Redirect URI **не потрібен** — ми використовуємо Google Identity Services (GIS)
     > ID-token flow (кнопка `<GoogleLogin>`), а не Authorization Code flow з redirect.

   → «Create».

6. **Скопіюй Client ID** — виглядає як `123456789-abcdef.apps.googleusercontent.com`.
   (Client Secret нам не потрібен — він для server-side flow.)

---

## 2. Згенерувати SESSION_SECRET

Сесійний JWT підписується симетричним секретом. Він має бути довгим і випадковим.
Сгенеруй в терміналі:

```bash
# Node.js (має бути встановлений)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# або PowerShell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Скопіюй вивід — це і буде `SESSION_SECRET`.

---

## 3. Локальний запуск (з авторизацією)

Скопіюй `.env.example` у реальний файл:

```bash
cp server/.env.example server/.env
cp web/.env.example web/.env
```

**`server/.env`** — заповни секцію Auth:

```env
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
ALLOWED_EMAILS=твоя-пошта@gmail.com
SESSION_SECRET=<рядок зі шагу 2>
AUTH_COOKIE_SECURE=false    # false для http://localhost (без HTTPS)
AUTH_DISABLED=              # порожньо = auth увімкнено
```

**`web/.env`** — Client ID для фронтенду (той самий):

```env
VITE_GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
VITE_API_BASE=              # порожньо для локалу — Vite-проксі направить /api → :3001
```

Запускай:

```bash
npm run dev
```

Відкрий http://localhost:5173 → побачиш екран входу з кнопкою Google → натисни → обери свій
акаунт (той, що в `ALLOWED_EMAILS`) → потрапляєш у дашборд.

### Локальний запуск без авторизації (як раніше)

Якщо хочеш запускати локально без логіну (наприклад, при розробці):

```env
# server/.env
AUTH_DISABLED=true
```

Тоді `GOOGLE_CLIENT_ID`/`SESSION_SECRET`/`ALLOWED_EMAILS` можна не заповнювати — сервер
запуститься без гейта.

---

## 4. Деплой на Render

> Передумова: фронтенд і API вже задеплоєні на Render (статичний сайт + Web Service).
> Детальніше — у `docs/plans/render-turso-phase0.md`.

### 4.1 Env-змінні для API (Web Service на Render)

Render Dashboard → твій API-сервіс → «Environment» → додай:

| Змінна | Значення |
|---|---|
| `GOOGLE_CLIENT_ID` | `123456789-abcdef.apps.googleusercontent.com` |
| `ALLOWED_EMAILS` | `твоя-пошта@gmail.com` |
| `SESSION_SECRET` | `<рядок зі шагу 2>` — **зберігай як Secret** |
| `AUTH_COOKIE_SECURE` | `true` |
| `WEB_ORIGIN` | `https://<твій-фронтенд>.onrender.com` |

> `AUTH_DISABLED` — **не виставляй** у проді. Відсутня змінна = auth увімкнено.

### 4.2 Env-змінні для фронтенду (Static Site на Render)

Render Dashboard → твій Static Site → «Environment» → додай:

| Змінна | Значення |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `123456789-abcdef.apps.googleusercontent.com` |
| `VITE_API_BASE` | `https://<твій-api>.onrender.com` |

> ⚠️ Vite-змінні (`VITE_*`) вбудовуються **під час build**, а не в runtime. Тому вони мають
> бути виставлені **до** деплою (Render їх підставить у `npm run build`).

### 4.3 Перевір Authorized JavaScript origins у Google Console

У Google Cloud Console → Credentials → твій Client ID → Edit → «Authorized JavaScript
origins» — переконайся, що є:
- `https://<твій-фронтенд>.onrender.com`
- `http://localhost:5173` (для локалу)

Збережи. Зміни набирають чинності через ~5 хвилин.

### 4.4 Перевірка після деплою

1. Відкрий `https://<твій-фронтенд>.onrender.com` в режимі інкогніто → маєш побачити екран
   входу з кнопкою Google.
2. Натисни, обери свій акаунт → дашборд відкривається.
3. DevTools → Application → Cookies → `https://<твій-фронтенд>.onrender.com` → немає там, але
   на домені API → `olx_session`: має бути `HttpOnly`, `Secure`, `SameSite=None`.
4. Curl без кукі → 401:
   ```bash
   curl -I https://<твій-api>.onrender.com/api/searches
   # HTTP/2 401
   ```

---

## 5. Що не треба робити

- **Не виставляй `CLIENT_SECRET`** — він не потрібен для GIS ID-token flow і його не треба
  ніде зберігати.
- **Не комітити** `server/.env` і `web/.env` — вони в `.gitignore`.
- **Не виставляй `AUTH_DISABLED=true` у проді** — це знімає увесь захист.
- **Не використовуй `*` в `WEB_ORIGIN`** — cross-site кукі вимагає явного домену.

---

## 6. Troubleshooting

| Проблема | Причина / Рішення |
|---|---|
| Кнопка Google не з'являється | `VITE_GOOGLE_CLIENT_ID` порожній або не збuildований. Перевір `web/.env` і перезапусти dev або деплой. |
| `400: redirect_uri_mismatch` | Не додав домен у «Authorized JavaScript origins» (не Redirect URI). GIS не потребує redirect URI — перевір origins. |
| `403 Forbidden` після логіну | Email не в `ALLOWED_EMAILS`. Додай свою адресу (lowercase, точно як в Google-акаунті). |
| `401` на `/api/auth/me` | Сесійна кукі не дійшла (cross-site без Secure/SameSite=None). Перевір `AUTH_COOKIE_SECURE=true` і `WEB_ORIGIN` на сервері. |
| Сервер не запускається | `Auth увімкнено, але відсутні: GOOGLE_CLIENT_ID…` — виправ `.env` або постав `AUTH_DISABLED=true`. |
| Кукі `olx_session` не ставиться локально | `AUTH_COOKIE_SECURE=false` має бути у `server/.env` для `http://localhost`. |
| «Access blocked: app not verified» | У OAuth consent screen → «Test users» додай свій email. Або опублікуй застосунок (не обов'язково для особистого інструменту). |
