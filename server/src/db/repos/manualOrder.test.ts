import { beforeEach, describe, expect, it } from 'vitest';
import { db, dbAll } from '../db.js';
import { resetDb } from '../../test/db.js';
import { isDirection, moveOneStep, nextTopSortOrder, type ManualOrderList } from './manualOrder.js';

// Механізм перевіряємо на власній таблиці: він не має знати про проєкти чи пошуки.
const TABLE = 'manual_order_test';
const PLAIN: ManualOrderList = { table: TABLE };
const GROUPED: ManualOrderList = { table: TABLE, groupColumn: 'grp', neighborFilter: 'hidden = 0' };

async function seed(rows: [id: number, sortOrder: number, grp: number | null, hidden: number][]): Promise<void> {
  await db.batch(
    rows.map(([id, sortOrder, grp, hidden]) => ({
      sql: `INSERT INTO ${TABLE} (id, sort_order, grp, hidden) VALUES (?, ?, ?, ?)`,
      args: [id, sortOrder, grp, hidden],
    })),
    'write',
  );
}

const order = async () =>
  (await dbAll<{ id: number }>(`SELECT id FROM ${TABLE} ORDER BY sort_order`)).map((r) => Number(r.id));

beforeEach(async () => {
  await resetDb();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (id INTEGER PRIMARY KEY, sort_order INTEGER, grp INTEGER, hidden INTEGER DEFAULT 0)`,
  );
  await db.execute(`DELETE FROM ${TABLE}`);
});

describe('isDirection', () => {
  it('лише up / down', () => {
    expect(isDirection('up')).toBe(true);
    expect(isDirection('down')).toBe(true);
    expect(isDirection('left')).toBe(false);
    expect(isDirection(undefined)).toBe(false);
  });
});

describe('nextTopSortOrder', () => {
  it('мінімум мінус 1; порожня таблиця → -1', async () => {
    expect(await nextTopSortOrder(PLAIN)).toBe(-1);
    await seed([[1, 3, null, 0], [2, -2, null, 0]]);
    expect(await nextTopSortOrder(PLAIN)).toBe(-3);
  });
});

describe('moveOneStep', () => {
  it('міняє місцями з сусідом; на краю — без змін; невідомий id → false', async () => {
    await seed([[1, 1, null, 0], [2, 2, null, 0], [3, 3, null, 0]]);
    expect(await moveOneStep(PLAIN, 2, 'up')).toBe(true);
    expect(await order()).toEqual([2, 1, 3]);
    expect(await moveOneStep(PLAIN, 2, 'up')).toBe(true);
    expect(await order()).toEqual([2, 1, 3]);
    expect(await moveOneStep(PLAIN, 99, 'down')).toBe(false);
  });

  it('сусід — лише з тієї ж групи (NULL — окрема група) і за фільтром', async () => {
    await seed([
      [1, 1, null, 0],
      [2, 2, 7, 0],
      [3, 3, null, 1],
      [4, 4, 7, 0],
      [5, 5, null, 0],
    ]);
    await moveOneStep(GROUPED, 5, 'up'); // 3 прихований, 2 і 4 з групи 7 → сусід 1
    expect(await order()).toEqual([5, 2, 3, 4, 1]);
    await moveOneStep(GROUPED, 2, 'down'); // сусід у групі 7 — лише 4
    expect(await order()).toEqual([5, 4, 3, 2, 1]);
  });
});
