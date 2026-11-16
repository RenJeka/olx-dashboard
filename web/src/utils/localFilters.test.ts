import { describe } from 'vitest';
import type { LocalFilters } from '../types';
import { makeFiltersForm, makeListing } from '../test/factories';
import { runCases } from '../test/table';
import {
  buildLocalFiltersPayload,
  evaluateLocalFilters,
  hasActiveLocalFilters,
  joinBullets,
  parseBullets,
  parseLocalFilters,
  withoutCategoryFilter,
} from './localFilters';

/** Чи сховають фільтри оголошення з такими полями. */
const hidden = (filters: LocalFilters, fields: Parameters<typeof makeListing>[0] = {}) =>
  evaluateLocalFilters(filters, makeListing(fields));
const priceRange = { price_range: { min: 5000, max: 15000 } };

describe('localFilters', () => {
  runCases([
    { name: 'parseLocalFilters — типовий JSON', run: () => parseLocalFilters('{"cities":["Київ"]}'), expected: { cities: ['Київ'] } },
    { name: 'parseLocalFilters — порожній рядок', run: () => parseLocalFilters(''), expected: {} },
    { name: 'parseLocalFilters — зіпсований JSON', run: () => parseLocalFilters('не json'), expected: {} },

    { name: 'parseBullets — маркери й порожні рядки', run: () => parseBullets('• коробка\n- гарантія\n\n  чек'), expected: ['коробка', 'гарантія', 'чек'] },
    { name: 'parseBullets — без тексту', run: () => parseBullets(null), expected: [] },
    { name: 'joinBullets — список пунктів', run: () => joinBullets(['коробка', 'чек']), expected: '• коробка\n• чек' },
    { name: 'joinBullets — порожній список', run: () => joinBullets([]), expected: '' },
    { name: 'joinBullets + parseBullets — туди й назад', run: () => parseBullets(joinBullets(['коробка', 'чек'])), expected: ['коробка', 'чек'] },

    { name: 'evaluateLocalFilters — без фільтрів', run: () => hidden({}), expected: false },
    { name: 'evaluateLocalFilters — ціна в діапазоні', run: () => hidden(priceRange, { price: 10000 }), expected: false },
    { name: 'evaluateLocalFilters — ціна поза діапазоном', run: () => hidden(priceRange, { price: 20000 }), expected: true },
    { name: 'evaluateLocalFilters — ціна на межі діапазону', run: () => hidden(priceRange, { price: 15000 }), expected: false },
    { name: 'evaluateLocalFilters — без ціни правило не діє', run: () => hidden(priceRange, { price: null }), expected: false },
    {
      name: 'evaluateLocalFilters — інвертована ціна ховає діапазон',
      run: () => hidden({ ...priceRange, invert: { price_range: true } }, { price: 10000 }),
      expected: true,
    },
    { name: 'evaluateLocalFilters — місто зі списку', run: () => hidden({ cities: ['Київ'] }, { city: 'Київ' }), expected: false },
    { name: 'evaluateLocalFilters — місто не зі списку', run: () => hidden({ cities: ['Львів'] }, { city: 'Київ' }), expected: true },
    { name: 'evaluateLocalFilters — без міста при списку міст', run: () => hidden({ cities: ['Київ'] }, { city: null }), expected: true },
    { name: 'evaluateLocalFilters — порожній список міст вимкнено', run: () => hidden({ cities: [] }, { city: null }), expected: false },
    { name: 'evaluateLocalFilters — продавець не зі списку', run: () => hidden({ sellers: ['Олена'] }, { seller_name: 'Іван' }), expected: true },
    { name: 'evaluateLocalFilters — є потрібний плюс', run: () => hidden({ pros: ['коробка'] }, { pros: '• коробка\n• чек' }), expected: false },
    { name: 'evaluateLocalFilters — немає потрібного плюса', run: () => hidden({ pros: ['коробка'] }, { pros: '' }), expected: true },
    {
      name: 'evaluateLocalFilters — інвертований мінус ховає збіг',
      run: () => hidden({ cons: ['подряпини'], invert: { cons: true } }, { cons: '• подряпини' }),
      expected: true,
    },
    { name: 'evaluateLocalFilters — категорія зі списку', run: () => hidden({ categories: [37] }, { category_id: 37 }), expected: false },
    { name: 'evaluateLocalFilters — без категорії при списку категорій', run: () => hidden({ categories: [37] }, { category_id: null }), expected: true },

    {
      name: 'withoutCategoryFilter — прибирає категорії та їхню інверсію',
      run: () => withoutCategoryFilter({ categories: [37], cities: ['Київ'], invert: { categories: true, cities: true } }),
      expected: { cities: ['Київ'], invert: { cities: true } },
    },
    {
      name: 'withoutCategoryFilter — інверсія лише категорій зникає цілком',
      run: () => Object.keys(withoutCategoryFilter({ categories: [37], invert: { categories: true } })),
      expected: [],
    },
    { name: 'withoutCategoryFilter — без фільтрів', run: () => withoutCategoryFilter({}), expected: {} },

    { name: 'hasActiveLocalFilters — без фільтрів', run: () => hasActiveLocalFilters('{}'), expected: false },
    { name: 'hasActiveLocalFilters — лише нижня межа ціни', run: () => hasActiveLocalFilters(JSON.stringify({ price_range: { min: 100 } })), expected: true },
    { name: 'hasActiveLocalFilters — порожні списки', run: () => hasActiveLocalFilters(JSON.stringify({ cities: [], cons: [] })), expected: false },
    { name: 'hasActiveLocalFilters — категорії', run: () => hasActiveLocalFilters(JSON.stringify({ categories: [37] })), expected: true },
    { name: 'hasActiveLocalFilters — зіпсований JSON', run: () => hasActiveLocalFilters('не json'), expected: false },

    { name: 'buildLocalFiltersPayload — порожня форма', run: () => buildLocalFiltersPayload(makeFiltersForm()), expected: {} },
    {
      name: 'buildLocalFiltersPayload — заповнені групи; інверсія без значень відкидається',
      run: () => buildLocalFiltersPayload(makeFiltersForm({ priceMin: '100', cities: ['Київ'], citiesInvert: true, sellersInvert: true })),
      expected: { price_range: { min: 100 }, cities: ['Київ'], invert: { cities: true } },
    },
    { name: 'buildLocalFiltersPayload — ціна з самих пробілів', run: () => buildLocalFiltersPayload(makeFiltersForm({ priceMin: '  ' })), expected: {} },
  ]);
});
