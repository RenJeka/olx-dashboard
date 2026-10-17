import { beforeEach, describe, expect, it } from 'vitest';
import { db, dbAll, dbGet } from '../db/db.js';
import { resetDb } from '../test/db.js';
import type { CategoryNode } from '../types.js';
import { createSearch } from '../test/db.js';
import {
  ancestorIds,
  descendantIds,
  pickBaseCategory,
  refreshBaseCategory,
  upsertCategories,
} from './tree.js';

const NODES: CategoryNode[] = [
  { id: 37, parentId: null, label: 'Електроніка', slug: 'elektronika' },
  { id: 1502, parentId: 37, label: 'Ноутбуки та аксесуари', slug: 'noutbuki-i-aksesuary' },
  { id: 80, parentId: 1502, label: 'Ноутбуки', slug: 'noutbuki' },
  { id: 1506, parentId: 37, label: 'Планшети', slug: 'planshety' },
];

beforeEach(resetDb);

describe('upsertCategories', () => {
  it('перший виклик вставляє всі вузли', async () => {
    expect(await upsertCategories(NODES)).toBe(4);
    const rows = await dbAll<{ id: number; parent_id: number | null; updated_at: string | null }>(
      'SELECT id, parent_id, updated_at FROM olx_categories ORDER BY id',
    );
    expect(rows.map((r) => [r.id, r.parent_id])).toEqual([[37, null], [80, 1502], [1502, 37], [1506, 37]]);
    expect(rows.every((r) => r.updated_at)).toBe(true);
  });

  it('повторний виклик тими самими вузлами → 0', async () => {
    await upsertCategories(NODES);
    expect(await upsertCategories(NODES)).toBe(0);
  });

  it('змінений label → 1', async () => {
    await upsertCategories(NODES);
    const changed = NODES.map((n) => (n.id === 1502 ? { ...n, label: 'Ноутбуки' } : n));
    expect(await upsertCategories(changed)).toBe(1);
    const row = await dbAll<{ label: string }>('SELECT label FROM olx_categories WHERE id = 1502');
    expect(row[0]?.label).toBe('Ноутбуки');
  });

  it('порожній список → 0', async () => {
    expect(await upsertCategories([])).toBe(0);
  });
});

describe('pickBaseCategory', () => {
  const counts = [{ categoryId: 80, n: 5 }, { categoryId: 1506, n: 9 }];

  it('без whitelist → категорія з найбільшою кількістю', () => {
    expect(pickBaseCategory(counts, [])).toBe(1506);
  });

  it('whitelist обмежує вибір', () => {
    expect(pickBaseCategory(counts, [80])).toBe(80);
  });

  it('порожні лічильники → null', () => {
    expect(pickBaseCategory([], [])).toBeNull();
  });

  it('нічия → менший categoryId', () => {
    expect(pickBaseCategory([{ categoryId: 90, n: 3 }, { categoryId: 70, n: 3 }], [])).toBe(70);
  });

  it('whitelist без збігів із лічильниками → ігнорується', () => {
    expect(pickBaseCategory(counts, [999])).toBe(1506);
  });
});

describe('ancestorIds / descendantIds', () => {
  it('ancestorIds — від кореня до id включно', () => {
    expect(ancestorIds(NODES, 80)).toEqual([37, 1502, 80]);
  });

  it('ancestorIds невідомого id → [id]', () => {
    expect(ancestorIds(NODES, 999)).toEqual([999]);
  });

  it('descendantIds — id і нащадки, без предків', () => {
    const ids = descendantIds(NODES, 1502);
    expect(ids).toContain(1502);
    expect(ids).toContain(80);
    expect(ids).not.toContain(37);
    expect(ids).not.toContain(1506);
  });
});

describe('refreshBaseCategory', () => {
  async function addListings(searchId: number, categoryId: number | null, n: number, startOlxId: number) {
    for (let i = 0; i < n; i++) {
      await db.execute({
        sql: 'INSERT INTO listings (olx_id, search_id, title, category_id) VALUES (?, ?, ?, ?)',
        args: [startOlxId + i, searchId, `item ${startOlxId + i}`, categoryId],
      });
    }
  }
  const baseOf = async (id: number) =>
    (await dbGet<{ base_category_id: number | null }>('SELECT base_category_id FROM searches WHERE id = ?', [id]))
      ?.base_category_id;

  it('домінуюча категорія без фільтрів', async () => {
    const id = await createSearch();
    await addListings(id, 80, 2, 100);
    await addListings(id, 1506, 3, 200);
    expect(await refreshBaseCategory(id)).toBe(1506);
    expect(await baseOf(id)).toBe(1506);
  });

  it('whitelist із local_filters.categories', async () => {
    const id = await createSearch({ categories: [80] });
    await addListings(id, 80, 2, 100);
    await addListings(id, 1506, 3, 200);
    expect(await refreshBaseCategory(id)).toBe(80);
  });

  it('invert.categories → список є виключенням', async () => {
    const id = await createSearch({ categories: [1506], invert: { categories: true } });
    await addListings(id, 80, 2, 100);
    await addListings(id, 1506, 3, 200);
    expect(await refreshBaseCategory(id)).toBe(80);
  });

  it('без оголошень → null і скидає попереднє значення', async () => {
    const id = await createSearch();
    await db.execute({ sql: 'UPDATE searches SET base_category_id = 80 WHERE id = ?', args: [id] });
    expect(await refreshBaseCategory(id)).toBeNull();
    expect(await baseOf(id)).toBeNull();
  });

  it('не чіпає searches.category_id', async () => {
    const id = await createSearch();
    await db.execute({ sql: 'UPDATE searches SET category_id = 5 WHERE id = ?', args: [id] });
    await addListings(id, 80, 1, 100);
    await refreshBaseCategory(id);
    expect(
      (await dbGet<{ category_id: number }>('SELECT category_id FROM searches WHERE id = ?', [id]))?.category_id,
    ).toBe(5);
  });
});
