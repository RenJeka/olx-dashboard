import { describe, expect, it } from 'vitest';
import { numberedFile } from '../analysis/manualZip.js';
import { errorMessage } from '../errors.js';
import { parseIds } from './http.js';

describe('parseIds', () => {
  it('не масив → порожній список', () => {
    expect(parseIds(undefined)).toEqual([]);
    expect(parseIds('1,2')).toEqual([]);
    expect(parseIds({ 0: 1 })).toEqual([]);
  });

  it('числа й числові рядки лишаються, решта відкидається', () => {
    expect(parseIds([1, '2', 'x', null, undefined, NaN, 3.5])).toEqual([1, 2, 0, 3.5]);
  });
});

describe('numberedFile', () => {
  it('номер з одиниці, три цифри', () => {
    expect(numberedFile('descriptions/chunk', 0)).toBe('descriptions/chunk-001.json');
    expect(numberedFile('nominations/nominees', 11)).toBe('nominations/nominees-012.json');
  });
});

describe('errorMessage', () => {
  it('Error → message; інше → рядок', () => {
    expect(errorMessage(new Error('збій'))).toBe('збій');
    expect(errorMessage('текст')).toBe('текст');
    expect(errorMessage(42)).toBe('42');
  });
});
