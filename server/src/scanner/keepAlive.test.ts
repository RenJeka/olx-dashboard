import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEEPALIVE_INTERVAL_MS, acquireKeepAlive } from './keepAlive.js';

// Самопінг під час скану: free-інстанс Render засинає після 15 хв без вхідних запитів
// (docs/plans/scan-keepalive.md, S9).
const URL = 'https://olx-dashboard-api.onrender.com';

const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  process.env.RENDER_EXTERNAL_URL = URL;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.RENDER_EXTERNAL_URL;
});

describe('acquireKeepAlive', () => {
  it('поки скан триває — пінгує публічний /health раз на інтервал; після release — тиша', async () => {
    const release = acquireKeepAlive();
    expect(fetchMock).not.toHaveBeenCalled(); // одразу не пінгує — інстанс щойно отримав запит

    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${URL}/health`, expect.anything());

    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    release();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('кілька одночасних сканів — один таймер, зупинка лише після останнього release', async () => {
    const releaseA = acquireKeepAlive();
    const releaseB = acquireKeepAlive();

    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    releaseA();
    releaseA(); // повторний release не збиває лічильник
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releaseB();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('без RENDER_EXTERNAL_URL (локально, CLI) — не пінгує', async () => {
    delete process.env.RENDER_EXTERNAL_URL;
    const release = acquireKeepAlive();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
    release();
  });

  it('збій пінгу не кидає — наступний пінг за розкладом', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const release = acquireKeepAlive();
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release();
  });
});
