import { describe, expect } from 'vitest';
import { AI_PICKS_LABEL } from '../constants';
import { makeListing } from '../test/factories';
import { runCases } from '../test/table';
import { buildScopeLabel, getDefaultScope, getScopeCounts, getScopeIds, tabName, type ScopeContext } from './aiScope';
import { STATUS_LABELS } from './status';

const listings = [
  makeListing({ id: 1 }),
  makeListing({ id: 2, status: 'interested', cons: '• подряпини' }),
  makeListing({ id: 3, filtered_out: 1 }),
  makeListing({ id: 4, ai_relevant: 0 }),
  makeListing({ id: 5, status: 'rejected' }),
];

const ctx = (fields: Partial<ScopeContext> = {}): ScopeContext => ({
  listings,
  selectedIds: [],
  statusFilter: 'all',
  showFilteredOut: false,
  showIrrelevant: false,
  ...fields,
});

describe('aiScope', () => {
  runCases([
    { name: 'getScopeIds all — усі рядки пошуку', run: () => getScopeIds('all', ctx()), expected: [1, 2, 3, 4, 5] },
    { name: 'getScopeIds tab — лише видимі в таблиці', run: () => getScopeIds('tab', ctx()), expected: [1, 2, 5] },
    {
      name: 'getScopeIds tab — вкладка статусу',
      run: () => getScopeIds('tab', ctx({ statusFilter: 'interested' })),
      expected: [2],
    },
    {
      name: 'getScopeIds tab — шум показано: як all',
      run: () => getScopeIds('tab', ctx({ showFilteredOut: true, showIrrelevant: true })),
      expected: [1, 2, 3, 4, 5],
    },
    { name: 'getScopeIds candidates — найкращі кандидати', run: () => getScopeIds('candidates', ctx()), expected: [1] },
    {
      name: 'getScopeIds selected — позначені рядки',
      run: () => getScopeIds('selected', ctx({ selectedIds: [2, 4] })),
      expected: [2, 4],
    },
    {
      name: 'getScopeIds — список ще не завантажено',
      run: () => getScopeIds('all', ctx({ listings: undefined })),
      expected: [],
    },
    {
      name: 'getScopeCounts — лічильники всіх обсягів',
      run: () => getScopeCounts(ctx({ selectedIds: [2] })),
      expected: { all: 5, tab: 3, selected: 1, candidates: 1 },
    },
    {
      name: 'getScopeCounts — порожній пошук',
      run: () => getScopeCounts(ctx({ listings: [] })),
      expected: { all: 0, tab: 0, selected: 0, candidates: 0 },
    },
    { name: 'getDefaultScope — є виділення', run: () => getDefaultScope([3], 'all'), expected: 'selected' },
    { name: 'getDefaultScope — вкладка статусу', run: () => getDefaultScope([], 'new'), expected: 'tab' },
    { name: 'getDefaultScope — вкладка «Всі»', run: () => getDefaultScope([], 'all'), expected: 'all' },
    { name: 'tabName — вкладка статусу', run: () => tabName('contacted'), expected: STATUS_LABELS.contacted },
    { name: 'tabName — найкращі кандидати', run: () => tabName('ai_picks'), expected: AI_PICKS_LABEL },
    {
      name: 'buildScopeLabel tab — містить назву вкладки',
      run: () => buildScopeLabel('tab', 'rejected'),
      expected: expect.stringContaining(STATUS_LABELS.rejected),
    },
    {
      name: 'buildScopeLabel candidates — підпис кандидатів',
      run: () => buildScopeLabel('candidates', 'all'),
      expected: AI_PICKS_LABEL,
    },
  ]);
});
