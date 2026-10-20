import { describe, expect, it } from 'vitest';
import {
  contradictsNegatedCriterion,
  excludeOppositeCriteria,
  mergeResults,
  parseGroupSuggestions,
  parseCriteriaResponse,
  parseMatchingResponse,
} from './parse.js';
import { MAX_CRITERIA } from './constants.js';
import { parseRelevanceResponse, prefilterCandidates } from './relevance.js';

describe('parseMatchingResponse — анти-галюцинація evidence', () => {
  const descriptions = new Map([[1, 'Батарея 87%, є подряпини на корпусі. Face ID працює.']]);
  const allowed = [
    { name: 'Подряпини', aliases: ['потертості'], enabled: true },
    { name: 'Не працює Face ID', aliases: [], enabled: true },
  ];

  it('evidence-підрядок опису → ok=true; вигаданий → ok=false; criterion зводиться до канонічного', () => {
    const raw = JSON.stringify([
      {
        id: 1,
        items: [
          { criterion: 'подряпини', evidence: 'є подряпини на корпусі' },
          { criterion: 'Не працює Face ID', evidence: 'Face ID не працює' },
        ],
      },
    ]);
    const [row] = parseMatchingResponse(raw, descriptions, allowed);
    expect(row?.items).toEqual([
      { criterion: 'Подряпини', evidence: 'є подряпини на корпусі', ok: true },
      { criterion: 'Не працює Face ID', evidence: 'Face ID не працює', ok: false },
    ]);
  });

  it('приймає JSON у markdown-огорожі та {results:[...]}', () => {
    const raw = '```json\n{"results":[{"id":1,"items":[{"criterion":"Подряпини","evidence":"подряпини"}]}]}\n```';
    expect(parseMatchingResponse(raw, descriptions, allowed)[0]?.items[0]?.ok).toBe(true);
  });

  it('синонім і скопійований рядок списку «(сюди ж: …)» зводяться до назви категорії', () => {
    const raw = JSON.stringify([
      {
        id: 1,
        items: [
          { criterion: 'Потертості', evidence: 'подряпини на корпусі' },
          { criterion: 'Подряпини (сюди ж: потертості)', evidence: 'подряпини' },
          { criterion: 'Не працює Face ID', evidence: 'Face ID працює' },
        ],
      },
    ]);
    expect(parseMatchingResponse(raw, descriptions, allowed)[0]?.items.map((i) => i.criterion)).toEqual([
      'Подряпини',
      'Не працює Face ID',
    ]);
  });

  it('невалідний JSON → зрозуміла помилка', () => {
    expect(() => parseMatchingResponse('не json', descriptions, allowed)).toThrow(/JSON/);
  });

  it('номер зі списку зрізається; критерій поза списком відкидається', () => {
    const raw = JSON.stringify([
      {
        id: 1,
        items: [
          { criterion: '1. Подряпини', evidence: 'подряпини' },
          { criterion: 'Батарея менше 85%', evidence: 'Батарея 87%' },
        ],
      },
    ]);
    expect(parseMatchingResponse(raw, descriptions, allowed)[0]?.items).toEqual([
      { criterion: 'Подряпини', evidence: 'подряпини', ok: true },
    ]);
  });

  it('критерій-заперечення з evidence без заперечення → ok=false (H3)', () => {
    const raw = JSON.stringify([{ id: 1, items: [{ criterion: 'Не працює Face ID', evidence: 'Face ID працює' }] }]);
    expect(parseMatchingResponse(raw, descriptions, allowed)[0]?.items[0]).toMatchObject({ ok: false });
  });
});

describe('contradictsNegatedCriterion', () => {
  it('«не X» + evidence з X без заперечення — суперечність', () => {
    expect(contradictsNegatedCriterion('не повна комплектація', 'Повна комплектація, коробка')).toBe(true);
    expect(contradictsNegatedCriterion('без торгу', 'Торг можливий')).toBe(true);
  });

  it('заперечення чи обмеження в evidence, інші слова, звичайний критерій — не суперечність', () => {
    expect(contradictsNegatedCriterion('не повна комплектація', 'В комплекті тільки ноутбук')).toBe(false);
    expect(contradictsNegatedCriterion('не повна комплектація', 'Без зарядного пристрою')).toBe(false);
    expect(contradictsNegatedCriterion('без торгу', 'Ціна остаточна')).toBe(false);
    expect(contradictsNegatedCriterion('Не працює Face ID', 'Face ID не працює')).toBe(false);
    expect(contradictsNegatedCriterion('повна комплектація', 'повна комплектація')).toBe(false);
  });
});

describe('excludeOppositeCriteria', () => {
  it('відкидає назви й синоніми протилежного режиму (регістр, пробіли), решту лишає', () => {
    const pros = [{ name: 'Повна комплектація', aliases: ['з коробкою'], enabled: true }];
    expect(excludeOppositeCriteria(['повна  комплектація', 'З коробкою', 'не повна комплектація'], pros)).toEqual([
      'не повна комплектація',
    ]);
  });

  it('mergeResults: об’єднання за id, новіший item перетирає за criterion', () => {
    const merged = mergeResults(
      [{ id: 1, items: [{ criterion: 'A', evidence: 'old', ok: false }] }],
      [{ id: 1, items: [{ criterion: 'a', evidence: 'new', ok: true }] }, { id: 2, items: [] }],
    );
    expect(merged).toEqual([
      { id: 1, items: [{ criterion: 'a', evidence: 'new', ok: true }] },
      { id: 2, items: [] },
    ]);
  });
});

describe('parseRelevanceResponse', () => {
  it('фільтрує невідомі id, дедуплікує, нормалізує relevant', () => {
    const raw = JSON.stringify({
      results: [
        { id: 1, relevant: 'true', reason: 'продає' },
        { id: 1, relevant: false },
        { id: 99, relevant: true },
        { id: 2, relevant: 0 },
      ],
    });
    expect(parseRelevanceResponse(raw, [1, 2])).toEqual([
      { id: 1, relevant: true, reason: 'продає' },
      { id: 2, relevant: false, reason: '' },
    ]);
  });
});

describe('prefilterCandidates — бренд + номер моделі поруч', () => {
  const l = (id: number, title: string) => ({ id, title, description: null, params: null });

  it('«iphone 5» відсіює iPhone 15 і далекі «5», лишає iPhone 5s і близькі (вікно = 4 слова)', () => {
    const { candidates, rejected } = prefilterCandidates('iphone 5', [
      l(1, 'Apple iPhone 5s 16GB'),
      l(2, 'iPhone 15 Pro'),
      l(3, 'Чохол для iphone у гарному стані ціна знижка 5 грн'), // відстань 6 > 4
      l(4, 'Чохол iphone, знижка 5 грн'), // відстань 2 ≤ 4 — обережно лишаємо для ШІ
    ]);
    expect(candidates.map((c) => c.id)).toEqual([1, 4]);
    expect(rejected.map((r) => [r.id, r.relevant])).toEqual([
      [2, false],
      [3, false],
    ]);
  });

  it('ціль без номера моделі — усі йдуть до ШІ', () => {
    const items = [l(1, 'велобіг дитячий'), l(2, 'чохол')];
    expect(prefilterCandidates('біговел', items).candidates).toHaveLength(2);
  });

  it('якщо відкинуло б усе — запобіжник пропускає всіх', () => {
    const items = [l(1, 'Samsung Galaxy'), l(2, 'Xiaomi')];
    expect(prefilterCandidates('iphone 5', items)).toEqual({ candidates: items, rejected: [] });
  });

  it('синоніми лише розширюють коло кандидатів', () => {
    const items = [l(1, 'Айфон 5 білий')];
    expect(prefilterCandidates('iphone 5', items, ['айфон 5']).candidates).toHaveLength(1);
  });
});

describe('parseGroupSuggestions — групи за аспектом', () => {
  const groups = [
    { name: 'тріснутий екран', aliases: [], enabled: true },
    { name: 'зламаний екран', aliases: ['розбитий екран'], enabled: true },
    { name: 'засвіт', aliases: [], enabled: true },
    { name: 'б/в стан', aliases: [], enabled: true },
    { name: 'експлуатований', aliases: [], enabled: false },
    { name: 'без торгу', aliases: [], enabled: true },
  ];
  const parse = (data: unknown) => parseGroupSuggestions(JSON.stringify(data), groups);
  const item = (criterion: string, aspect: string) => ({ criterion, aspect });

  it('однаковий аспект (регістр, пробіли) → група; критерій зводиться до назви (синонім, «сюди ж»); невідомий відкинутий', () => {
    expect(
      parse({
        items: [
          item('Тріснутий екран', 'Екран'),
          item('розбитий екран', ' екран '),
          item('вигаданий критерій', 'екран'),
          item('б/в стан (сюди ж: ношений)', 'загальний стан'),
          item('експлуатований', 'загальний  стан'),
          item('без торгу', 'ціна'),
        ],
      }),
    ).toEqual([
      { name: 'зламаний екран', members: ['тріснутий екран', 'зламаний екран'] },
      { name: 'б/в стан', members: ['б/в стан', 'експлуатований'] },
    ]);
  });

  it('повторний критерій лишається з першим аспектом; група з одного члена відкинута; «(протилежне)» — окремий аспект', () => {
    expect(
      parse({
        items: [
          item('засвіт', 'екран'),
          item('тріснутий екран', 'екран'),
          item('засвіт', 'підсвітка'),
          item('б/в стан', 'стан'),
          item('експлуатований', 'стан (протилежне)'),
        ],
      }),
    ).toEqual([{ name: 'тріснутий екран', members: ['тріснутий екран', 'засвіт'] }]);
  });

  it('приймає масив і JSON в огорожі; порожня відповідь → []; сміттєві пункти пропускаються; не JSON → помилка', () => {
    const raw = '```json\n[{"criterion":"б/в стан","aspect":"стан"},{"criterion":"експлуатований","aspect":"стан"}]\n```';
    expect(parseGroupSuggestions(raw, groups)).toHaveLength(1);
    expect(parse({ items: [] })).toEqual([]);
    expect(parse({ items: [null, 'x', { criterion: 1 }, item('б/в стан', 'стан'), item('експлуатований', 'стан')] })).toHaveLength(1);
    expect(() => parseGroupSuggestions('не json', groups)).toThrow();
  });
});

describe('parseCriteriaResponse — ліміт пунктів', () => {
  const many = JSON.stringify(Array.from({ length: MAX_CRITERIA + 5 }, (_, i) => `пункт ${i + 1}`));

  it('типово — не більше MAX_CRITERIA; явний ліміт — свій; дублі й порожні не рахуються', () => {
    expect(parseCriteriaResponse(many)).toHaveLength(MAX_CRITERIA);
    expect(parseCriteriaResponse(many, 3)).toEqual(['пункт 1', 'пункт 2', 'пункт 3']);
    expect(parseCriteriaResponse(many, Infinity)).toHaveLength(MAX_CRITERIA + 5);
    expect(parseCriteriaResponse('["а", "А", " ", "б"]', 2)).toEqual(['а', 'б']);
  });
});
