import { describe, expect, it } from 'vitest';
import {
  aliasMap,
  enabledGroups,
  normalizeGroups,
  parseCriteriaConfig,
  phraseKey,
  planRemap,
  remapBullets,
  remapLocalFilters,
} from './criteria.js';
import { buildCriteriaPrompt, buildMatchingPrompt } from './prompts.js';
import type { CriterionGroup } from '../types.js';

const g = (name: string, aliases: string[] = [], enabled = true): CriterionGroup => ({ name, aliases, enabled });
const keys = (...values: string[]) => new Set(values.map(phraseKey));

describe('parseCriteriaConfig', () => {
  it('старий формат (рядки) → увімкнені категорії без синонімів', () => {
    expect(parseCriteriaConfig(JSON.stringify({ cons: ['подряпини', ' без  торгу '], pros: [] }))).toEqual({
      cons: [g('подряпини'), g('без торгу')],
      pros: [],
    });
  });

  it('новий формат; битий JSON і порожнє → порожній конфіг', () => {
    const cfg = { cons: [g('дефект екрану', ['тріснутий екран'], false)], pros: [] };
    expect(parseCriteriaConfig(JSON.stringify(cfg))).toEqual(cfg);
    expect(parseCriteriaConfig('{oops')).toEqual({ cons: [], pros: [] });
    expect(parseCriteriaConfig(null)).toEqual({ cons: [], pros: [] });
  });
});

describe('normalizeGroups', () => {
  it('дубль назви (без регістру) відкидається; синонім не може бути назвою чи синонімом іншої категорії', () => {
    const out = normalizeGroups([
      g('Дефект екрану', ['тріснутий екран', 'без торгу', 'дефект екрану']),
      g('дефект екрану'),
      g('без торгу'),
      g('биті пікселі', ['Тріснутий  екран', 'смуги']),
    ]);
    expect(out).toEqual([
      g('Дефект екрану', ['тріснутий екран']),
      g('без торгу'),
      g('биті пікселі', ['смуги']),
    ]);
  });
});

describe('enabledGroups / aliasMap', () => {
  it('лише ввімкнені; синонім і назва зводяться до назви', () => {
    const groups = [g('дефект екрану', ['тріснутий екран']), g('8 GB', [], false)];
    expect(enabledGroups({ cons: groups, pros: [] }, 'cons').map((x) => x.name)).toEqual(['дефект екрану']);
    const map = aliasMap(groups);
    expect(map.get(phraseKey('Тріснутий екран'))).toBe('дефект екрану');
    expect(map.get(phraseKey('дефект екрану'))).toBe('дефект екрану');
  });
});

describe('remapBullets', () => {
  it('синонім → категорія без дублів, порядок зберігається', () => {
    const text = '• тріснутий екран\n• без торгу\n• Зламаний екран\n• дефект екрану';
    expect(remapBullets(text, keys('тріснутий екран', 'зламаний екран', 'дефект екрану'), 'дефект екрану')).toBe(
      '• дефект екрану\n• без торгу',
    );
  });

  it('видалення; без збігу — текст як є', () => {
    expect(remapBullets('• 8 GB\n• без торгу', keys('8 gb'), null)).toBe('• без торгу');
    expect(remapBullets('• 8 GB', keys('8 gb'), null)).toBe('');
    expect(remapBullets('• без торгу', keys('8 gb'), null)).toBe('• без торгу');
    expect(remapBullets(null, keys('8 gb'), null)).toBeNull();
  });
});

describe('planRemap', () => {
  const groups = [
    g('тріснутий екран'),
    g('без торгу', [], false),
    g('зламаний екран', ['розбитий дисплей'], false),
    g('биті пікселі'),
  ];

  it('об’єднання в нову назву: синоніми = назви й синоніми обраних, місце першої, enabled — якщо хоч одна була', () => {
    const plan = planRemap(groups, ['тріснутий екран', 'зламаний екран'], 'дефект екрану');
    expect(plan.groups).toEqual([
      g('дефект екрану', ['тріснутий екран', 'зламаний екран', 'розбитий дисплей']),
      g('без торгу', [], false),
      g('биті пікселі'),
    ]);
    expect(plan.keys).toEqual(keys('дефект екрану', 'тріснутий екран', 'зламаний екран', 'розбитий дисплей'));
  });

  it('об’єднання в наявну категорію і пункт «лише в оголошеннях»', () => {
    const plan = planRemap(groups, ['биті пікселі', 'смуги на екрані'], 'зламаний екран');
    expect(plan.groups.find((x) => x.name === 'зламаний екран')).toEqual(
      g('зламаний екран', ['розбитий дисплей', 'биті пікселі', 'смуги на екрані']),
    );
    expect(plan.groups.map((x) => x.name)).toEqual(['тріснутий екран', 'без торгу', 'зламаний екран']);
  });

  it('перейменування: стара назва стає синонімом', () => {
    const plan = planRemap(groups, ['без торгу'], 'ціна остаточна');
    expect(plan.groups[1]).toEqual(g('ціна остаточна', ['без торгу'], false));
  });

  it('видалення: категорія разом із синонімами', () => {
    const plan = planRemap(groups, ['зламаний екран'], null);
    expect(plan.groups.map((x) => x.name)).toEqual(['тріснутий екран', 'без торгу', 'биті пікселі']);
    expect(plan.keys).toEqual(keys('зламаний екран', 'розбитий дисплей'));
  });
});

describe('remapLocalFilters', () => {
  it('перейменовує пункти режиму; порожній список прибирає правило й інверсію', () => {
    const filters = { cons: ['тріснутий екран', 'зламаний екран'], pros: ['коробка'], invert: { cons: true } };
    expect(remapLocalFilters(filters, 'cons', keys('тріснутий екран', 'зламаний екран'), 'дефект екрану')).toEqual({
      ...filters,
      cons: ['дефект екрану'],
    });
    expect(remapLocalFilters(filters, 'cons', keys('тріснутий екран', 'зламаний екран'), null)).toEqual({
      pros: ['коробка'],
      invert: {},
    });
    expect(remapLocalFilters(filters, 'pros', keys('інше'), null)).toBe(filters);
  });
});

describe('промпти з категоріями', () => {
  const groups = [g('дефект екрану', ['тріснутий екран', 'зламаний екран']), g('без торгу')];

  it('matching: назва + «сюди ж» синоніми; без синонімів — лише назва', () => {
    const prompt = buildMatchingPrompt(groups, [{ id: 1, title: 'MacBook', description: 'Опис', params: null }], 'cons');
    expect(prompt).toContain('1. дефект екрану (сюди ж: тріснутий екран, зламаний екран)');
    expect(prompt).toContain('2. без торгу\n');
  });

  it('генерація: наявні категорії — у блоці «не повторюй»', () => {
    expect(buildCriteriaPrompt('macbook', [], 'cons', undefined, groups)).toContain(
      'Уже є критерії (НЕ повторюй їх і НЕ перефразовуй — лише нові, іншого змісту):\n- дефект екрану (сюди ж: тріснутий екран, зламаний екран)\n- без торгу',
    );
    expect(buildCriteriaPrompt('macbook', [], 'cons')).not.toContain('Уже є критерії');
  });
});
