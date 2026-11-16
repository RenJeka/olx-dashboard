import { describe, expect } from 'vitest';
import { makeCategoryOption, makeListing } from '../test/factories';
import { runCases } from '../test/table';
import {
  buildCategoryCountMap,
  buildCategoryTree,
  collectBranchKeys,
  countOutsideTree,
  countUncategorized,
  nodeCheckedState,
} from './categoryCounts';

const options = [
  makeCategoryOption({ id: 37, path: ['Електроніка'], olxCount: 100 }),
  makeCategoryOption({ id: 44, path: ['Електроніка', 'Телефони'], olxCount: 70 }),
  makeCategoryOption({ id: 80, path: ['Електроніка', 'Ноутбуки'], olxCount: 30 }),
  makeCategoryOption({ id: 5, path: ['Дім'], olxCount: 200 }),
];
/** Категорії 999 в дереві немає. */
const listings = [
  makeListing({ category_id: 44 }),
  makeListing({ category_id: 44 }),
  makeListing({ category_id: 80 }),
  makeListing({ category_id: 999 }),
  makeListing({ category_id: null }),
];
const tree = () => buildCategoryTree(options, buildCategoryCountMap(listings));
const electronics = () => tree().find((n) => n.id === 37)!;

describe('categoryCounts', () => {
  runCases([
    {
      name: 'buildCategoryCountMap — оголошення за категоріями, без категорії пропущено',
      run: () => buildCategoryCountMap(listings),
      expected: new Map([[44, 2], [80, 1], [999, 1]]),
    },
    { name: 'buildCategoryCountMap — без оголошень', run: () => buildCategoryCountMap([]), expected: new Map() },

    { name: 'countUncategorized — оголошення без категорії', run: () => countUncategorized(listings), expected: 1 },
    { name: 'countUncategorized — без оголошень', run: () => countUncategorized([]), expected: 0 },
    { name: 'countOutsideTree — категорії немає в дереві', run: () => countOutsideTree(listings, options), expected: 1 },
    { name: 'countOutsideTree — порожнє дерево: усі з категорією', run: () => countOutsideTree(listings, []), expected: 4 },

    { name: 'buildCategoryTree — корені за спаданням лічильника OLX', run: () => tree().map((n) => n.label), expected: ['Дім', 'Електроніка'] },
    {
      name: 'buildCategoryTree — вузол рахує оголошення підкатегорій',
      run: electronics,
      expected: expect.objectContaining({ olxCount: 100, shownCount: 3, depth: 0 }),
    },
    {
      name: 'buildCategoryTree — діти за спаданням лічильника OLX',
      run: () => electronics().children.map((n) => n.key),
      expected: ['Електроніка / Телефони', 'Електроніка / Ноутбуки'],
    },
    {
      name: 'buildCategoryTree — однаковий лічильник: за назвою',
      run: () =>
        buildCategoryTree(
          [makeCategoryOption({ path: ['Телефони'], olxCount: 10 }), makeCategoryOption({ path: ['Авто'], olxCount: 10 })],
          new Map(),
        ).map((n) => n.label),
      expected: ['Авто', 'Телефони'],
    },
    {
      name: 'buildCategoryTree — батька немає у списку: проміжний вузол веде до нащадка',
      run: () => buildCategoryTree([makeCategoryOption({ id: 44, path: ['Електроніка', 'Телефони'] })], new Map())[0],
      expected: expect.objectContaining({ label: 'Електроніка', leafIds: [44] }),
    },
    { name: 'buildCategoryTree — без категорій', run: () => buildCategoryTree([], new Map()), expected: [] },

    { name: 'nodeCheckedState — обрано всю гілку', run: () => nodeCheckedState(electronics(), new Set([37, 44, 80])), expected: true },
    { name: 'nodeCheckedState — обрано частину гілки', run: () => nodeCheckedState(electronics(), new Set([44])), expected: 'indeterminate' },
    { name: 'nodeCheckedState — нічого не обрано', run: () => nodeCheckedState(electronics(), new Set()), expected: false },

    { name: 'collectBranchKeys — лише вузли з дітьми', run: () => collectBranchKeys(tree()), expected: ['Електроніка'] },
    { name: 'collectBranchKeys — порожнє дерево', run: () => collectBranchKeys([]), expected: [] },
  ]);
});
