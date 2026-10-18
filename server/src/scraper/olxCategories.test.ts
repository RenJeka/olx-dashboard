import { describe, expect, it } from 'vitest';
import { facetToNodes, facetToOptions } from './olxCategories.js';
import type { FacetCategory } from '../types.js';

const facet = (id: number, count: number, label: string, path: string): FacetCategory => ({
  id,
  count,
  label,
  url: `https://www.olx.ua/${path}/q-x/`,
});

const FULL: FacetCategory[] = [
  facet(37, 900, 'Електроніка', 'elektronika'),
  facet(1502, 500, 'Ноутбуки та аксесуари', 'elektronika/noutbuki-i-aksesuary'),
  facet(80, 300, 'Ноутбуки', 'elektronika/noutbuki-i-aksesuary/noutbuki'),
];

describe('facetToNodes', () => {
  it('будує parentId і власний slug з url', () => {
    const nodes = facetToNodes(FULL);
    expect(nodes).toEqual([
      { id: 37, parentId: null, label: 'Електроніка', slug: 'elektronika' },
      { id: 1502, parentId: 37, label: 'Ноутбуки та аксесуари', slug: 'noutbuki-i-aksesuary' },
      { id: 80, parentId: 1502, label: 'Ноутбуки', slug: 'noutbuki' },
    ]);
  });

  it('приймає url у вигляді відносного шляху', () => {
    const nodes = facetToNodes([
      { id: 37, count: 1, label: 'Електроніка', url: '/elektronika/q-x' },
      { id: 1502, count: 1, label: 'Ноутбуки та аксесуари', url: '/elektronika/noutbuki-i-aksesuary/q-x' },
    ]);
    expect(nodes.map((n) => [n.id, n.parentId, n.slug])).toEqual([
      [37, null, 'elektronika'],
      [1502, 37, 'noutbuki-i-aksesuary'],
    ]);
  });

  it('предка немає у відповіді → parentId null', () => {
    const nodes = facetToNodes([FULL[2]!]);
    expect(nodes).toEqual([{ id: 80, parentId: null, label: 'Ноутбуки', slug: 'noutbuki' }]);
  });
});

describe('facetToOptions', () => {
  it('path — назви root→leaf, olxCount = count', () => {
    expect(facetToOptions(FULL)).toEqual([
      { id: 37, olxCount: 900, path: ['Електроніка'] },
      { id: 1502, olxCount: 500, path: ['Електроніка', 'Ноутбуки та аксесуари'] },
      { id: 80, olxCount: 300, path: ['Електроніка', 'Ноутбуки та аксесуари', 'Ноутбуки'] },
    ]);
  });

  it('предка немає → у path лишається слаг', () => {
    expect(facetToOptions([FULL[2]!])).toEqual([
      { id: 80, olxCount: 300, path: ['elektronika', 'noutbuki-i-aksesuary', 'Ноутбуки'] },
    ]);
  });
});
