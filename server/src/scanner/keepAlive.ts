// ── Самопінг під час скану (docs/plans/old/scan-keepalive.md, S9) ─────────────────
// Free-інстанс Render засинає після 15 хв без вхідних запитів, а глибокий скан іде всередині
// одного довгого HTTP-запиту (трафіком не рахується); поллінг фронту стає на паузу у фоновій
// вкладці. Поки триває хоча б один скан, сервер сам звертається до своєї публічної адреси.
// Публічну адресу Render задає сам (RENDER_EXTERNAL_URL); локально й у CLI її немає — тиша.
import { logWarn } from '../logger.js';

/** Інтервал пінгу: з запасом менше за 15 хв простою, після яких Render присипляє інстанс. */
export const KEEPALIVE_INTERVAL_MS = 5 * 60_000;
const PING_TIMEOUT_MS = 15_000;

let activeScans = 0;
let timer: NodeJS.Timeout | null = null;

function publicUrl(): string | undefined {
  const url = process.env.RENDER_EXTERNAL_URL?.trim();
  return url ? url.replace(/\/+$/, '') : undefined;
}

// Best-effort: збій пінгу лише в журнал, скан не зачіпає.
async function ping(url: string): Promise<void> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) logWarn('scanner', 'keep-alive', `GET /health → HTTP ${res.status}`);
  } catch (err) {
    logWarn('scanner', 'keep-alive', `пінг не вдався: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Позначити початок скану; повертає release (ідемпотентний), який треба викликати в кінці.
 * Таймер один на всі одночасні скани і зупиняється після останнього release.
 */
export function acquireKeepAlive(): () => void {
  activeScans += 1;
  const url = publicUrl();
  if (url && !timer) {
    timer = setInterval(() => void ping(url), KEEPALIVE_INTERVAL_MS);
    timer.unref(); // не тримати процес живим лише через таймер
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeScans -= 1;
    if (activeScans === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
