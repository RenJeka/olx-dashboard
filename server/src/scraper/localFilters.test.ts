import { describe, expect, it } from 'vitest';
import { evaluateFilteredOut, type FilterableListing } from './localFilters.js';

const listing = (overrides: Partial<FilterableListing> = {}): FilterableListing => ({
  title: 'iPhone 13',
  description: null,
  params: '{}',
  price: 10000,
  city: 'Київ',
  seller_name: 'Олег',
  pros: '• гарна батарея',
  cons: '• подряпини',
  category_id: 1535,
  ...overrides,
});

describe('evaluateFilteredOut', () => {
  it('порожні фільтри нічого не ховають', () => {
    expect(evaluateFilteredOut({}, listing())).toBe(false);
  });

  it('ціна: поза діапазоном ховається, у межах — ні; price=null — правило не застосовується', () => {
    const f = { price_range: { min: 5000, max: 12000 } };
    expect(evaluateFilteredOut(f, listing({ price: 15000 }))).toBe(true);
    expect(evaluateFilteredOut(f, listing({ price: 12000 }))).toBe(false);
    expect(evaluateFilteredOut(f, listing({ price: null }))).toBe(false);
  });

  it('інвертований режим: збіги ховаються (чорний список)', () => {
    const f = { cities: ['Київ'], invert: { cities: true } };
    expect(evaluateFilteredOut(f, listing({ city: 'Київ' }))).toBe(true);
    expect(evaluateFilteredOut(f, listing({ city: 'Львів' }))).toBe(false);
  });

  it('міста й продавці — точна відповідність; null не проходить білий список', () => {
    expect(evaluateFilteredOut({ cities: ['Київ'] }, listing({ city: 'Львів' }))).toBe(true);
    expect(evaluateFilteredOut({ sellers: ['Олег'] }, listing({ seller_name: null }))).toBe(true);
  });

  it('плюси/мінуси: потрібен хоча б один збіг серед пунктів', () => {
    expect(evaluateFilteredOut({ pros: ['гарна батарея'] }, listing())).toBe(false);
    expect(evaluateFilteredOut({ cons: ['розбитий екран'] }, listing())).toBe(true);
    expect(evaluateFilteredOut({ cons: ['подряпини'], invert: { cons: true } }, listing())).toBe(true);
  });

  it('категорії за category_id', () => {
    expect(evaluateFilteredOut({ categories: [1535] }, listing())).toBe(false);
    expect(evaluateFilteredOut({ categories: [99] }, listing())).toBe(true);
  });

  it('групи комбінуються через AND: достатньо однієї, що ховає', () => {
    const f = { cities: ['Київ'], price_range: { max: 5000 } };
    expect(evaluateFilteredOut(f, listing({ city: 'Київ', price: 10000 }))).toBe(true);
  });
});
