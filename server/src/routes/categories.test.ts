import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger.js', () => ({ logWarn: vi.fn(), logError: vi.fn() }));
const collect = vi.hoisted(() => vi.fn());
vi.mock('../categories/collector.js', () => ({ collectCategories: collect }));

import { categoriesRoutes } from './categories.js';

describe('POST /api/categories/collect', () => {
  it('повертає результат; паралельний виклик → 409; після завершення прапорець знято', async () => {
    const app = Fastify();
    await app.register(categoriesRoutes);

    let release!: (v: { requested: number; changed: number; failed: string[] }) => void;
    collect.mockReturnValueOnce(new Promise((r) => (release = r)));
    const first = app.inject({ method: 'POST', url: '/api/categories/collect' });
    await vi.waitFor(() => expect(collect).toHaveBeenCalledTimes(1));

    const second = await app.inject({ method: 'POST', url: '/api/categories/collect' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toContain('уже йде');

    release({ requested: 2, changed: 5, failed: ['x'] });
    const res = await first;
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ requested: 2, changed: 5, failed: ['x'] });

    collect.mockResolvedValueOnce({ requested: 1, changed: 0, failed: [] });
    expect((await app.inject({ method: 'POST', url: '/api/categories/collect' })).statusCode).toBe(200);
    await app.close();
  });
});
