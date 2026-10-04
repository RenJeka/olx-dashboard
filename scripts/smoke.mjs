// Smoke-перевірка деплою (npm run smoke -- [api-url] [web-url]; план — docs/plans/h4-smoke.md).
// Лише GET без сесії: нічого не пише й не читає дані (гейт авторизації віддає 401).
// Без аргументів — адреси проду (docs/deploy-render-turso.md → «Фактичний прод»).
// Будь-який ❌ → код виходу 1.

const DEFAULT_API = 'https://olx-dashboard-api.onrender.com';
const DEFAULT_WEB = 'https://olx-dashboard.onrender.com';
/** Render free засинає без трафіку — перший запит може чекати пробудження до хвилини. */
const WAKE_TIMEOUT_MS = 90_000;
const TIMEOUT_MS = 20_000;

const trimSlash = (url) => url.replace(/\/+$/, '');
const api = trimSlash(process.argv[2] ?? DEFAULT_API);
const web = trimSlash(process.argv[3] ?? DEFAULT_WEB);

let failed = 0;

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    console.log(`✅ ${name} (${Date.now() - started} мс)${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    failed += 1;
    console.log(`❌ ${name} (${Date.now() - started} мс) — ${err instanceof Error ? err.message : err}`);
  }
}

function get(url, { timeout = TIMEOUT_MS, headers } = {}) {
  return fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
}

function expectStatus(res, expected) {
  if (res.status !== expected) throw new Error(`HTTP ${res.status}, очікувано ${expected}`);
}

console.log(`API: ${api}\nФронт: ${web}\n`);

await check('API /health', async () => {
  const res = await get(`${api}/health`, { timeout: WAKE_TIMEOUT_MS });
  expectStatus(res, 200);
  const body = await res.json();
  if (body?.ok !== true) throw new Error(`тіло ${JSON.stringify(body)}, очікувано {"ok":true}`);
});

await check('API без сесії закритий (гейт авторизації)', async () => {
  const res = await get(`${api}/api/searches`);
  if (res.status === 200) throw new Error('HTTP 200 — дані віддаються без входу (AUTH_DISABLED?)');
  expectStatus(res, 401);
});

await check('CORS для фронту', async () => {
  const res = await get(`${api}/health`, { headers: { Origin: web } });
  const allowed = res.headers.get('access-control-allow-origin');
  if (allowed !== web) throw new Error(`access-control-allow-origin = ${allowed ?? '—'}, очікувано ${web} (WEB_ORIGIN?)`);
});

let indexHtml = '';
await check('Фронт index.html', async () => {
  const res = await get(`${web}/`, { timeout: WAKE_TIMEOUT_MS });
  expectStatus(res, 200);
  indexHtml = await res.text();
  if (!indexHtml.includes('<div id="root">')) throw new Error('немає <div id="root"> — це не збірка фронту');
});

await check('Фронт JS-бандл', async () => {
  const src = indexHtml.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  if (!src) throw new Error('у index.html немає <script src="….js">');
  const res = await get(new URL(src, `${web}/`).href);
  expectStatus(res, 200);
  return src;
});

console.log(failed ? `\n❌ Провалено перевірок: ${failed}` : '\n✅ Усе гаразд');
process.exit(failed ? 1 : 0);
