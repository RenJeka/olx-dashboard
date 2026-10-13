import { describe, expect, it } from 'vitest';
import {
  buildReport,
  contextAround,
  criterionLabelKey,
  matchLabelKey,
  mergeLabelTodo,
  type EvalFile,
  type LabelEntry,
} from './llmEval.js';

const file: EvalFile = {
  tag: 'before',
  searchId: 2,
  createdAt: '2026-10-11T00:00:00Z',
  complete: true,
  cost: 0.003,
  generation: [
    { model: 'm', mode: 'cons', run: 1, criteria: ['тріщина на екрані', 'Повна комплектація', '8 GB RAM'], cost: 0.001 },
    { model: 'm', mode: 'cons', run: 2, criteria: ['тріщина  на екрані'], cost: 0.001 },
  ],
  matching: [
    { model: 'm', mode: 'cons', listingId: 1, criterion: 'тріщина на екрані', evidence: 'тріщина', context: '' },
    { model: 'm', mode: 'cons', listingId: 2, criterion: 'не повна комплектація', evidence: 'повна комплектація', context: '' },
    { model: 'm', mode: 'cons', listingId: 3, criterion: 'сервісна батарея', evidence: 'ціна', context: '' },
  ],
  matchingRuns: [{ model: 'm', mode: 'cons', listings: 3, unverified: 1, cost: 0.001, errors: [] }],
};

describe('llmEval: мітки', () => {
  it('ключ критерію не залежить від регістру й пробілів', () => {
    expect(criterionLabelKey('cons', 'Тріщина  на екрані')).toBe(criterionLabelKey('cons', 'тріщина на екрані'));
    expect(criterionLabelKey('cons', 'x')).not.toBe(criterionLabelKey('pros', 'x'));
  });

  it('todo — по одному запису на унікальний ключ, наявні мітки зберігаються', () => {
    const existing: LabelEntry[] = [
      { key: criterionLabelKey('cons', 'тріщина на екрані'), kind: 'criterion', label: 'drawback', mode: 'cons', text: 'тріщина на екрані' },
    ];
    const merged = mergeLabelTodo(existing, [file]);
    expect(merged[0]).toEqual(existing[0]);
    expect(merged.filter((l) => l.kind === 'criterion')).toHaveLength(3);
    expect(merged.filter((l) => l.kind === 'match')).toHaveLength(3);
    expect(merged.filter((l) => l.label === '')).toHaveLength(5);
  });
});

describe('llmEval: метрики', () => {
  it('рахує хибну полярність, нейтральні, precision і перевернуті', () => {
    const labels: LabelEntry[] = mergeLabelTodo([], [file]).map((l) => {
      if (l.kind === 'criterion') {
        const label = l.text === 'Повна комплектація' ? 'advantage' : l.text === '8 GB RAM' ? 'neutral' : 'drawback';
        return { ...l, label };
      }
      const label = l.text === 'не повна комплектація' ? 'flipped' : l.text === 'сервісна батарея' ? 'wrong' : 'ok';
      return { ...l, label };
    });
    const [row] = buildReport([file], labels);
    expect(row).toMatchObject({
      tag: 'before', model: 'm', mode: 'cons',
      genTotal: 4, genWrong: 1, genNeutral: 1, genUnlabeled: 0,
      matchTotal: 3, matchOk: 1, matchFlipped: 1, matchWrong: 1, matchUnlabeled: 0,
    });
    expect(row?.cost).toBeCloseTo(0.003);
  });

  it('нерозмічене не входить у частки', () => {
    const [row] = buildReport([file], []);
    expect(row).toMatchObject({ genUnlabeled: 4, matchUnlabeled: 3, genWrong: 0, matchOk: 0 });
  });

  it('ключ пари залежить від evidence', () => {
    const base = { mode: 'cons' as const, listingId: 1, criterion: 'a' };
    expect(matchLabelKey({ ...base, evidence: 'X y' })).toBe(matchLabelKey({ ...base, evidence: 'x  y' }));
    expect(matchLabelKey({ ...base, evidence: 'x' })).not.toBe(matchLabelKey({ ...base, evidence: 'z' }));
  });
});

describe('llmEval: контекст evidence', () => {
  it('показує заперечення поруч', () => {
    expect(contextAround('Продам. Не повна комплектація, без коробки.', 'повна комплектація', 4)).toBe('… Не повна комплектація, бе…');
    expect(contextAround('текст', 'немає')).toBe('');
  });
});
