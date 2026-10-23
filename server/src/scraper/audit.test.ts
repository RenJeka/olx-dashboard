import { describe, expect, it } from 'vitest';
import { compareSnapshot, hasDiff, htmlShape, jsonShape, mediaType } from './audit.js';

describe('jsonShape', () => {
  it('збирає шляхи об’єктів і масивів, об’єднуючи елементи масиву', () => {
    const shape = jsonShape({
      data: { items: [{ id: 1, user: { name: 'a' } }, { id: 2, user: null, extra: true }] },
    });
    expect(shape).toEqual([
      'data',
      'data.items',
      'data.items[].extra',
      'data.items[].id',
      'data.items[].user',
      'data.items[].user.name',
    ]);
  });

  it('примітив чи null на корені — порожньо', () => {
    expect(jsonShape(null)).toEqual([]);
    expect(jsonShape('x')).toEqual([]);
  });
});

describe('htmlShape', () => {
  it('повертає лише знайдені селектори', () => {
    const html = '<div data-cy="l-card"><h4>Назва</h4></div>';
    expect(htmlShape(html, ['card', 'title', 'price'])).toEqual(['selector:card', 'selector:title']);
  });
});

describe('mediaType', () => {
  it('відкидає параметри й регістр', () => {
    expect(mediaType('Application/JSON; charset=utf-8')).toBe('application/json');
    expect(mediaType(null)).toBeNull();
  });
});

describe('compareSnapshot', () => {
  const etalon = { status: 200, contentType: 'application/json', shape: ['a', 'a.b'] };

  it('однакові знімки — без розбіжностей', () => {
    expect(hasDiff(compareSnapshot(etalon, { ...etalon }))).toBe(false);
  });

  it('показує зниклі й нові поля та зміну статусу', () => {
    const diff = compareSnapshot(etalon, { status: 403, contentType: 'text/html', shape: ['a', 'c'] });
    expect(diff).toEqual({ statusChanged: true, typeChanged: true, missing: ['a.b'], added: ['c'] });
    expect(hasDiff(diff)).toBe(true);
  });

  it('без еталону — не розбіжність у hasDiff', () => {
    expect(hasDiff(null)).toBe(false);
  });
});
