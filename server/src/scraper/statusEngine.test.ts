import { beforeEach, describe, expect, it } from 'vitest';
import { applyScanStatuses } from './statusEngine.js';
import { createSearch, getListing, gqlListing, insertListing, resetDb } from '../test/db.js';

// Вікно покриття: docs/business-rules.md §3, інцидент 395 хибних disable (2026-06-12).
const FLOOR = '2026-09-20T10:00:00+03:00'; // lastRefreshAt останнього отриманого
const IN_WINDOW = '2026-09-25T10:00:00+03:00'; // новіше за floor → у вікні
const BELOW_WINDOW = '2026-09-01T10:00:00+03:00'; // старіше за floor → поза вікном

let searchId: number;

beforeEach(async () => {
  await resetDb();
  searchId = await createSearch();
});

/** Скан, що бачив лише оголошення 1 (низ видачі — FLOOR), не вичерпав видачу. */
const scanSeeingOnly1 = (threshold?: number) =>
  applyScanStatuses(searchId, [gqlListing(1, { lastRefreshAt: FLOOR })], false, threshold);

describe('applyScanStatuses — вікно покриття', () => {
  it('зникле у вікні: 1-й промах лише рахується, 2-й вимикає (поріг звичайного скану = 2)', async () => {
    await insertListing(searchId, 1, { last_refresh_at: FLOOR });
    await insertListing(searchId, 2, { last_refresh_at: IN_WINDOW });

    expect(await scanSeeingOnly1()).toEqual({ disabled_count: 0 });
    expect(await getListing(2)).toMatchObject({ status: 'new', miss_count: 1 });

    expect(await scanSeeingOnly1()).toEqual({ disabled_count: 1 });
    const row = await getListing(2);
    expect(row).toMatchObject({ status: 'disabled', miss_count: 2, olx_status: 'inactive' });
    expect(row?.note).toContain('auto-disabled: coverage miss_count=2');
  });

  it('глибокий скан (поріг 1) вимикає з першого промаху', async () => {
    await insertListing(searchId, 2, { last_refresh_at: IN_WINDOW });
    expect(await scanSeeingOnly1(1)).toEqual({ disabled_count: 1 });
    expect((await getListing(2))?.note).toContain('coverage miss_count=1');
  });

  it('рядки поза вікном і без last_refresh_at — не кандидати', async () => {
    await insertListing(searchId, 2, { last_refresh_at: BELOW_WINDOW });
    await insertListing(searchId, 3, { last_refresh_at: null });
    await scanSeeingOnly1(1);
    expect(await getListing(2)).toMatchObject({ status: 'new', miss_count: 0 });
    expect(await getListing(3)).toMatchObject({ status: 'new', miss_count: 0 });
  });

  it('вичерпана видача (exhausted) — вікно на всю видачу, включно з NULL-refresh', async () => {
    // ⚠️ Фіксує ПОТОЧНУ поведінку коду: при exhausted NULL-refresh рядки теж кандидати.
    // Документація (AGENTS.md / business-rules.md) каже «NULL-refresh — не кандидати ніколи»;
    // розбіжність винесено на рішення людини (docs/plans/vitest-setup.md → «Відкриті питання»).
    await insertListing(searchId, 2, { last_refresh_at: BELOW_WINDOW });
    await insertListing(searchId, 3, { last_refresh_at: null });
    await applyScanStatuses(searchId, [gqlListing(1)], true, 1);
    expect((await getListing(2))?.status).toBe('disabled');
    expect((await getListing(3))?.status).toBe('disabled');
  });

  it('без осі (порожня видача, не exhausted) — прохід пропускається', async () => {
    await insertListing(searchId, 2, { last_refresh_at: IN_WINDOW });
    expect(await applyScanStatuses(searchId, [], false, 1)).toEqual({ disabled_count: 0 });
    expect((await getListing(2))?.miss_count).toBe(0);
  });

  it('floor — ОСТАННІЙ елемент видачі, а не min() (промо-вкраплення не розтягують вікно)', async () => {
    await insertListing(searchId, 2, { last_refresh_at: '2026-09-10T10:00:00+03:00' });
    // Промо з дуже старою датою посередині видачі; низ видачі — FLOOR.
    const fetched = [
      gqlListing(10, { lastRefreshAt: IN_WINDOW }),
      gqlListing(11, { lastRefreshAt: '2020-01-01T00:00:00+02:00' }),
      gqlListing(12, { lastRefreshAt: FLOOR }),
    ];
    await applyScanStatuses(searchId, fetched, false, 1);
    expect((await getListing(2))?.status).toBe('new'); // 09-10 < floor 09-20 → поза вікном
  });
});

describe('applyScanStatuses — ручні статуси', () => {
  it('manual-статус не вимикається, лише рахується промах', async () => {
    await insertListing(searchId, 2, {
      last_refresh_at: IN_WINDOW,
      status: 'interested',
      status_source: 'manual',
    });
    await scanSeeingOnly1(1);
    expect(await getListing(2)).toMatchObject({ status: 'interested', miss_count: 1 });
  });

  it('manual rejected → disabled (зникнення сильніше за ручну оцінку)', async () => {
    await insertListing(searchId, 2, {
      last_refresh_at: IN_WINDOW,
      status: 'rejected',
      status_source: 'manual',
    });
    await scanSeeingOnly1(1);
    expect((await getListing(2))?.status).toBe('disabled');
  });

  it('маркер причини в note дописується, а не перезаписує нотатку, і не дублюється', async () => {
    await insertListing(searchId, 2, { last_refresh_at: IN_WINDOW, note: 'моя нотатка' });
    await scanSeeingOnly1(1);
    const note = (await getListing(2))?.note ?? '';
    expect(note.startsWith('моя нотатка\n')).toBe(true);
    expect(note.match(/coverage miss_count/g)).toHaveLength(1);
  });
});
