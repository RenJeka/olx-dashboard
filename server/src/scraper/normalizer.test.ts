import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db.js';
import { parsePrice, upsertListings } from './normalizer.js';
import { allListings, createSearch, getListing, gqlListing, insertListing, resetDb } from '../test/db.js';

describe('parsePrice', () => {
  it.each([
    ['6 000 грн.', 6000, 'UAH'],
    ['6 000 грн.', 6000, 'UAH'],
    ['$ 250', 250, 'USD'],
    ['300 €', 300, 'EUR'],
    ['Договірна', null, 'UAH'],
    ['', null, 'UAH'],
  ])('%j → %s %s', (raw, price, currency) => {
    expect(parsePrice(raw)).toEqual({ price, currency });
  });
});

describe('upsertListings', () => {
  let searchId: number;
  beforeEach(async () => {
    await resetDb();
    searchId = await createSearch();
  });

  it('новий olx_id → insert зі status=new; дубль у тій самій видачі рахується один раз', async () => {
    const res = await upsertListings(searchId, [gqlListing(1), gqlListing(2), gqlListing(1)]);
    expect(res).toEqual({ found: 3, new_count: 2 });
    expect((await allListings()).map((r) => [r.olx_id, r.status])).toEqual([
      [1, 'new'],
      [2, 'new'],
    ]);
  });

  it('повторний скан не дублює рядки (ключ — olx_id)', async () => {
    await upsertListings(searchId, [gqlListing(1)]);
    const res = await upsertListings(searchId, [gqlListing(1, { price: 9000 })]);
    expect(res.new_count).toBe(0);
    expect(await allListings()).toHaveLength(1);
    expect((await getListing(1))?.price).toBe(9000);
  });

  it('присутнє у видачі GraphQL → miss_count скидається в 0', async () => {
    await insertListing(searchId, 1, { miss_count: 1, last_refresh_at: '2026-09-20T10:00:00+03:00' });
    await upsertListings(searchId, [gqlListing(1, { price: 12345 })]);
    expect((await getListing(1))?.miss_count).toBe(0);
  });

  it('olx_status ≠ active → миттєвий disable з причиною в note (новий рядок)', async () => {
    await upsertListings(searchId, [gqlListing(1, { olxStatus: 'removed_by_user' })]);
    const row = await getListing(1);
    expect(row?.status).toBe('disabled');
    expect(row?.note).toContain('auto-disabled: olx_status=removed_by_user');
  });

  it('olx_status ≠ active не чіпає manual-статус (крім rejected)', async () => {
    await insertListing(searchId, 1, { status: 'interested', status_source: 'manual' });
    await insertListing(searchId, 2, { status: 'rejected', status_source: 'manual' });
    await upsertListings(searchId, [
      gqlListing(1, { olxStatus: 'outdated' }),
      gqlListing(2, { olxStatus: 'outdated' }),
    ]);
    expect((await getListing(1))?.status).toBe('interested');
    expect((await getListing(2))?.status).toBe('disabled');
  });

  it('auto-reactivate: auto-disabled знову живий → new; manual-disabled лишається', async () => {
    await insertListing(searchId, 1, { status: 'disabled', status_source: 'auto', miss_count: 2 });
    await insertListing(searchId, 2, { status: 'disabled', status_source: 'manual' });
    await upsertListings(searchId, [gqlListing(1), gqlListing(2)]);
    expect(await getListing(1)).toMatchObject({ status: 'new', miss_count: 0 });
    expect((await getListing(2))?.status).toBe('disabled');
  });

  it('HTML-fallback (без createdAt) не затирає зібрані GraphQL-поля', async () => {
    await upsertListings(searchId, [gqlListing(1, { description: 'повний опис' })]);
    await upsertListings(searchId, [
      { olxId: 1, title: 'item 1', rawPrice: '9 000 грн.', url: 'https://www.olx.ua/x', locationDate: 'Київ - Сьогодні о 12:00' },
    ]);
    const row = await getListing(1);
    expect(row?.description).toBe('повний опис');
    expect(row?.last_refresh_at).toBe('2026-09-20T10:00:00+03:00');
    expect(row?.price).toBe(9000);
  });

  it('local_filters лише ставлять filtered_out, рядок не видаляється', async () => {
    const filtered = await createSearch({ price_range: { max: 5000 } });
    await upsertListings(filtered, [gqlListing(1, { price: 10000 }), gqlListing(2, { price: 3000 })]);
    expect((await allListings()).map((r) => [r.olx_id, r.filtered_out])).toEqual([
      [1, 1],
      [2, 0],
    ]);
  });

  it('зміна опису після аналізу → analysis_stale=1', async () => {
    await upsertListings(searchId, [gqlListing(1, { description: 'старий' })]);
    await db.execute("UPDATE listings SET analysis_at = datetime('now') WHERE olx_id = 1");
    await upsertListings(searchId, [gqlListing(1, { description: 'новий' })]);
    expect((await getListing(1))?.analysis_stale).toBe(1);
  });

  it('price_history поки НЕ пишеться (Етап 3)', async () => {
    await upsertListings(searchId, [gqlListing(1, { price: 10000 })]);
    await upsertListings(searchId, [gqlListing(1, { price: 9000 })]);
    const { rows } = await db.execute('SELECT count(*) AS n FROM price_history');
    expect(Number(rows[0]?.n)).toBe(0); // ⏳ змінити на 1, коли реалізуємо Етап 3
  });
});
