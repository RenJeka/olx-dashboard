import { beforeEach, describe, expect, it } from 'vitest';
import { dbAll } from '../db/db.js';
import { resetDb } from '../test/db.js';
import type { CategoryNode } from '../types.js';
import { upsertCategories } from './tree.js';

const NODES: CategoryNode[] = [
  { id: 37, parentId: null, label: 'Електроніка', slug: 'elektronika' },
  { id: 1502, parentId: 37, label: 'Ноутбуки та аксесуари', slug: 'noutbuki-i-aksesuary' },
];

beforeEach(resetDb);

describe('upsertCategories', () => {
  it('перший виклик вставляє всі вузли', async () => {
    expect(await upsertCategories(NODES)).toBe(2);
    const rows = await dbAll<{ id: number; parent_id: number | null; updated_at: string | null }>(
      'SELECT id, parent_id, updated_at FROM olx_categories ORDER BY id',
    );
    expect(rows.map((r) => [r.id, r.parent_id])).toEqual([[37, null], [1502, 37]]);
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
