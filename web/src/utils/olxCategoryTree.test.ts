import { describe, expect } from 'vitest';
import { makeOlxCategory } from '../test/factories';
import { runCases } from '../test/table';
import { ancestorIds, categoryPath, flattenTree, indexCategories, visibleForQuery } from './olxCategoryTree';

// Електроніка(1) → Телефони(2) → iPhone(4); Електроніка(1) → Ноутбуки(3); Авто(5) — батька немає у списку.
const index = indexCategories([
  makeOlxCategory({ id: 1, label: 'Електроніка' }),
  makeOlxCategory({ id: 2, parentId: 1, label: 'Телефони' }),
  makeOlxCategory({ id: 3, parentId: 1, label: 'Ноутбуки' }),
  makeOlxCategory({ id: 4, parentId: 2, label: 'iPhone' }),
  makeOlxCategory({ id: 5, parentId: 99, label: 'Авто' }),
]);
/** Дані з циклом: кожен вузол — батько іншого. */
const cycle = indexCategories([makeOlxCategory({ id: 1, parentId: 2 }), makeOlxCategory({ id: 2, parentId: 1 })]);

const childIds = (parent: number | null) => (index.children.get(parent) ?? []).map((c) => c.id);
const rowIds = (expanded: number[], query: string) => flattenTree(index, new Set(expanded), query).map((r) => r.node.id);

describe('olxCategoryTree', () => {
  runCases([
    { name: 'indexCategories — корені за назвою; сирота стає коренем', run: () => childIds(null), expected: [5, 1] },
    { name: 'indexCategories — діти за назвою', run: () => childIds(1), expected: [3, 2] },
    { name: 'indexCategories — порожній список', run: () => indexCategories([]).byId.size, expected: 0 },

    { name: 'ancestorIds — від батька до кореня', run: () => ancestorIds(index, 4), expected: [2, 1] },
    { name: 'ancestorIds — корінь без предків', run: () => ancestorIds(index, 1), expected: [] },
    { name: 'ancestorIds — невідомий вузол', run: () => ancestorIds(index, 404), expected: [] },
    { name: 'ancestorIds — цикл у даних не зависає', run: () => ancestorIds(cycle, 1).slice(0, 2), expected: [2, 1] },

    { name: 'categoryPath — назви від кореня до вузла', run: () => categoryPath(index, 4), expected: ['Електроніка', 'Телефони', 'iPhone'] },
    { name: 'categoryPath — невідомий вузол', run: () => categoryPath(index, 404), expected: [] },

    { name: 'visibleForQuery — збіг і його предки, без регістру', run: () => visibleForQuery(index, ' IPH '), expected: new Set([4, 2, 1]) },
    { name: 'visibleForQuery — збігів немає', run: () => visibleForQuery(index, 'велосипед'), expected: new Set() },

    { name: 'flattenTree — усе згорнуто: лише корені', run: () => rowIds([], ''), expected: [5, 1] },
    { name: 'flattenTree — розкритий вузол показує дітей', run: () => rowIds([1], ''), expected: [5, 1, 3, 2] },
    {
      name: 'flattenTree — рядок розкритого вузла',
      run: () => flattenTree(index, new Set([1]), '')[1],
      expected: expect.objectContaining({ depth: 0, hasChildren: true, expanded: true }),
    },
    { name: 'flattenTree — пошук: збіг із предками, розкрито без expanded', run: () => rowIds([], 'iphone'), expected: [1, 2, 4] },
    {
      name: 'flattenTree — пошук: діти збігу, що самі не збігаються, сховані',
      run: () => flattenTree(index, new Set([1, 2]), 'телефони').at(-1),
      expected: expect.objectContaining({ depth: 1, hasChildren: false, expanded: false }),
    },
    { name: 'flattenTree — пошук без збігів', run: () => rowIds([1], 'велосипед'), expected: [] },
  ]);
});
