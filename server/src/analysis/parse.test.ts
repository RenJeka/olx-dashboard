import { describe, expect, it } from 'vitest';
import { mergeResults, parseGroupSuggestions, parseMatchingResponse } from './parse.js';
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

describe('parseGroupSuggestions — перевірки пропозицій автогрупування', () => {
  const groups = [
    { name: 'тріснутий екран', aliases: [], enabled: true },
    { name: 'зламаний екран', aliases: ['розбитий екран'], enabled: true },
    { name: 'засвіт', aliases: [], enabled: true },
    { name: 'б/в стан', aliases: [], enabled: true },
    { name: 'експлуатований', aliases: [], enabled: false },
    { name: 'без торгу', aliases: [], enabled: true },
  ];
  const parse = (data: unknown) => parseGroupSuggestions(JSON.stringify(data), groups);

  it('члени зводяться до назв зі списку (регістр, синонім, «сюди ж»); невідомий член відкинутий', () => {
    expect(
      parse({
        groups: [
          { name: 'дефект екрану', members: ['Тріснутий екран', 'розбитий екран', 'вигаданий критерій'] },
          { name: 'стан', members: ['б/в стан (сюди ж: ношений)', 'експлуатований'] },
        ],
      }),
    ).toEqual([
      { name: 'дефект екрану', members: ['тріснутий екран', 'зламаний екран'] },
      { name: 'стан', members: ['б/в стан', 'експлуатований'] },
    ]);
  });

  it('член у двох групах лишається в першій; група з одного члена відкинута', () => {
    expect(
      parse({
        groups: [
          { name: 'дефект екрану', members: ['тріснутий екран', 'зламаний екран'] },
          { name: 'екран', members: ['зламаний екран', 'засвіт'] },
          { name: 'торг', members: ['без торгу', 'без торгу'] },
        ],
      }),
    ).toEqual([{ name: 'дефект екрану', members: ['тріснутий екран', 'зламаний екран'] }]);
  });

  it('назва: порожня, > 6 слів, збіг з критерієм поза групою чи з назвою іншої групи → перший член', () => {
    const result = parse({
      groups: [
        { name: '', members: ['тріснутий екран', 'зламаний екран'] },
        { name: 'один два три чотири пʼять шість сім', members: ['б/в стан', 'експлуатований'] },
        { name: 'без торгу', members: ['засвіт', 'розбитий екран'] },
      ],
    });
    expect(result.map((s) => s.name)).toEqual(['тріснутий екран', 'б/в стан']);

    expect(
      parse({
        groups: [
          { name: 'дефект', members: ['тріснутий екран', 'зламаний екран'] },
          { name: 'Дефект', members: ['б/в стан', 'засвіт'] },
          { name: 'Засвіт', members: ['без торгу', 'експлуатований'] },
        ],
      }).map((s) => s.name),
    ).toEqual(['дефект', 'б/в стан', 'без торгу']);
  });

  it('приймає масив і JSON в огорожі; порожня відповідь → []; не JSON → помилка', () => {
    const raw = '```json\n[{"name":"стан","members":["б/в стан","експлуатований"]}]\n```';
    expect(parseGroupSuggestions(raw, groups)).toHaveLength(1);
    expect(parse({ groups: [] })).toEqual([]);
    expect(() => parseGroupSuggestions('не json', groups)).toThrow();
  });
});
