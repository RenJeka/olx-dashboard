import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db.js';
import { createSearch, resetDb } from '../test/db.js';
import type { CriteriaConfig, CriterionGroup } from '../types.js';
import {
  applyCriteriaBody,
  getEffectiveCriteria,
  mergeBaseCriteria,
  parseBaseDisabled,
  retainAbsorbedOwn,
  stripBaseCriteria,
} from './baseCriteria.js';

// Базові плюси/мінуси категорій (docs/plans/base-criteria.md, задача 4): злиття з власними пунктами пошуку.

const group = (name: string, aliases: string[] = [], enabled = true): CriterionGroup => ({ name, aliases, enabled });
const cfg = (cons: CriterionGroup[], pros: CriterionGroup[] = []): CriteriaConfig => ({ cons, pros });
const NONE = { cons: [], pros: [] };

const ELECTRONICS = { categoryId: 37, label: 'Електроніка', config: cfg([group('не працює')]) };
const LAPTOPS = { categoryId: 80, label: 'Ноутбуки', config: cfg([group('розбитий екран', ['розбитий дисплей'])]) };

describe('mergeBaseCriteria', () => {
  it('бази від кореня до листа, потім власні; базові з атрибуцією', () => {
    const merged = mergeBaseCriteria(cfg([group('подряпини')]), [ELECTRONICS, LAPTOPS], NONE);
    expect(merged.cons).toEqual([
      { name: 'не працює', aliases: [], enabled: true, base: { categoryId: 37, label: 'Електроніка' } },
      { name: 'розбитий екран', aliases: ['розбитий дисплей'], enabled: true, base: { categoryId: 80, label: 'Ноутбуки' } },
      { name: 'подряпини', aliases: [], enabled: true },
    ]);
    expect(merged.pros).toEqual([]);
  });

  it('однакове формулювання у власному й базовому — один пункт з base, синоніми злиті', () => {
    const own = cfg([group('Розбитий Екран', ['тріщина екрану'])]);
    const merged = mergeBaseCriteria(own, [LAPTOPS], NONE);
    expect(merged.cons).toEqual([
      {
        name: 'розбитий екран',
        aliases: ['розбитий дисплей', 'тріщина екрану'],
        enabled: true,
        base: { categoryId: 80, label: 'Ноутбуки' },
      },
    ]);
  });

  it('збіг через синонім: власна назва стає синонімом базового; перша (коренева) база перемагає', () => {
    const child = { categoryId: 80, label: 'Ноутбуки', config: cfg([group('не вмикається', ['не працює'])]) };
    const own = cfg([group('мертвий', ['не вмикається'])]);
    const merged = mergeBaseCriteria(own, [ELECTRONICS, child], NONE);
    expect(merged.cons).toEqual([
      {
        name: 'не працює',
        aliases: ['не вмикається', 'мертвий'],
        enabled: true,
        base: { categoryId: 37, label: 'Електроніка' },
      },
    ]);
  });

  it('вимкнений у довіднику пункт не успадковується', () => {
    const base = { categoryId: 37, label: 'Електроніка', config: cfg([group('не працює', [], false), group('без коробки')]) };
    expect(mergeBaseCriteria(cfg([]), [base], NONE).cons.map((g) => g.name)).toEqual(['без коробки']);
  });

  it('вимкнений власний пункт, поглинутий базовим, → базовий enabled: false', () => {
    const merged = mergeBaseCriteria(cfg([group('Не працює', ['мертвий'], false)]), [ELECTRONICS], NONE);
    expect(merged.cons).toEqual([
      { name: 'не працює', aliases: ['мертвий'], enabled: false, base: { categoryId: 37, label: 'Електроніка' } },
    ]);
  });

  it('disabled.cons = [не працює] → пункт є, enabled: false; збіг і за синонімом', () => {
    const merged = mergeBaseCriteria(cfg([]), [ELECTRONICS, LAPTOPS], { cons: ['не працює', 'Розбитий Дисплей'], pros: [] });
    expect(merged.cons.map((g) => [g.name, g.enabled])).toEqual([
      ['не працює', false],
      ['розбитий екран', false],
    ]);
  });
});

describe('stripBaseCriteria', () => {
  it('базові пункти не йдуть у own; вимкнений базовий → disabled', () => {
    const base = { categoryId: 37, label: 'Електроніка' };
    const incoming = cfg(
      [
        { name: 'не працює', aliases: [], enabled: false, base },
        { name: 'розбитий екран', aliases: [], enabled: true, base },
        group('подряпини'),
      ],
      [group('коробка', [], false)],
    );
    expect(stripBaseCriteria(incoming)).toEqual({
      own: { cons: [group('подряпини')], pros: [group('коробка', [], false)] },
      disabled: { cons: ['не працює'], pros: [] },
    });
  });
});

describe('stripBaseCriteria — очищення вимкнень', () => {
  it('назви вимкнених базових чистяться (пробіли) і не дублюються за phraseKey; не-масив режиму → порожньо', () => {
    const base = { categoryId: 37, label: 'Електроніка' };
    const res = stripBaseCriteria({
      cons: [
        { name: '  не   працює ', aliases: [], enabled: false, base },
        { name: 'Не працює', aliases: [], enabled: false, base },
      ],
      pros: 'x',
    });
    expect(res.disabled).toEqual({ cons: ['не працює'], pros: [] });
    expect(res.own).toEqual({ cons: [], pros: [] });
  });
});

describe('applyCriteriaBody / retainAbsorbedOwn', () => {
  it('відсутній режим лишає поточні власні й вимкнення; тіло не-об’єкт → усе як було', () => {
    const current = cfg([group('a')], [group('b')]);
    const res = applyCriteriaBody({ cons: ['c'] }, current, { cons: ['x'], pros: ['y'] });
    expect(res).toEqual({ own: cfg([group('c')], [group('b')]), disabled: { cons: [], pros: ['y'] } });
    expect(applyCriteriaBody(null, current)).toEqual({ own: current, disabled: { cons: [], pros: [] } });
  });

  it('збережений поглинутий пункт лишається зі станом базового, якщо вхід його не містить; непоглинуті — ні', () => {
    const stored = cfg([group('Не працює', ['мертвий'], false), group('подряпини')]);
    // Базовий увімкнений → поглинутий зберігається увімкненим (інакше назавжди вимикав би базовий).
    const kept = retainAbsorbedOwn(cfg([group('без торгу')]), stored, [ELECTRONICS], NONE);
    expect(kept.cons).toEqual([group('без торгу'), group('Не працює', ['мертвий'])]);
    // Базовий вимкнений у пошуку (base_disabled) → поглинутий зберігається вимкненим.
    const off = retainAbsorbedOwn(cfg([group('без торгу')]), stored, [ELECTRONICS], { cons: ['не працює'], pros: [] });
    expect(off.cons).toEqual([group('без торгу'), group('Не працює', ['мертвий'], false)]);
    // Вхід уже містить пункт → без дубля.
    const same = retainAbsorbedOwn(cfg([group('не працює')]), stored, [ELECTRONICS], NONE);
    expect(same.cons).toEqual([group('не працює')]);
    // Без баз — нічого не додається.
    expect(retainAbsorbedOwn(cfg([]), stored, [], NONE).cons).toEqual([]);
  });
});

describe('parseBaseDisabled', () => {
  it('битий/відсутній JSON → порожньо; не-рядки відкидаються', () => {
    expect(parseBaseDisabled(null)).toEqual({ cons: [], pros: [] });
    expect(parseBaseDisabled('{oops')).toEqual({ cons: [], pros: [] });
    expect(parseBaseDisabled('{"cons":["a",1],"pros":"x"}')).toEqual({ cons: ['a'], pros: [] });
  });
});

describe('getEffectiveCriteria', () => {
  beforeEach(resetDb);

  async function seedTree(): Promise<void> {
    await db.batch(
      [
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (37, NULL, 'Електроніка', 'elektronika')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (1502, 37, 'Ноутбуки та аксесуари', 'na')`,
        `INSERT INTO olx_categories (id, parent_id, label, slug) VALUES (80, 1502, 'Ноутбуки', 'noutbuki')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (37, '{"cons":["не працює"],"pros":[]}')`,
        `INSERT INTO base_criteria (category_id, criteria) VALUES (80, '{"cons":["розбитий екран"],"pros":[]}')`,
      ],
      'write',
    );
  }

  async function searchWith(baseCategoryId: number | null, disabled = '{}'): Promise<number> {
    const id = await createSearch();
    await db.execute({
      sql: 'UPDATE searches SET analysis_criteria = ?, base_category_id = ?, base_disabled = ? WHERE id = ?',
      args: ['{"cons":["подряпини"],"pros":[]}', baseCategoryId, disabled, id],
    });
    return id;
  }

  it('шлях категорії й базові набори предків', async () => {
    await seedTree();
    const id = await searchWith(80, '{"cons":["не працює"]}');
    const { config, category } = await getEffectiveCriteria(id);
    expect(category).toEqual({ id: 80, path: ['Електроніка', 'Ноутбуки та аксесуари', 'Ноутбуки'] });
    expect(config.cons.map((g) => [g.name, g.enabled, g.base?.categoryId ?? null])).toEqual([
      ['не працює', false, 37],
      ['розбитий екран', true, 80],
      ['подряпини', true, null],
    ]);
  });

  it('категорії немає в olx_categories → лише власні, category: null', async () => {
    await seedTree();
    const id = await searchWith(999);
    const { config, category } = await getEffectiveCriteria(id);
    expect(category).toBeNull();
    expect(config.cons).toEqual([group('подряпини')]);
  });
});
