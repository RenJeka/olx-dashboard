import { describe } from 'vitest';
import { makeListing } from '../test/factories';
import { runCases } from '../test/table';
import { extractSearchTerms, hasSearchOperators, matchesQuery, toHighlightQuery } from './search';

/** Текст рядка таблиці в нижньому регістрі — так його готує викликач. */
const haystack = (makeListing({ title: 'iPhone 13 Pro' }).title ?? '').toLowerCase();
const matches = (query: string) => matchesQuery(haystack, query);

describe('search', () => {
  runCases([
    { name: 'matchesQuery — звичайний підрядок', run: () => matches('iphone'), expected: true },
    { name: 'matchesQuery — регістр запиту не важливий', run: () => matches('IPHONE'), expected: true },
    { name: 'matchesQuery — підрядка немає', run: () => matches('samsung'), expected: false },
    { name: 'matchesQuery — порожній запит', run: () => matches(''), expected: true },
    { name: 'matchesQuery — запит із пробілів', run: () => matches('   '), expected: true },
    { name: 'matchesQuery — ТА: обидва терми є', run: () => matches('iphone && pro'), expected: true },
    { name: 'matchesQuery — ТА: одного терма немає', run: () => matches('iphone && max'), expected: false },
    { name: 'matchesQuery — АБО: є хоча б один', run: () => matches('samsung || pro'), expected: true },
    { name: 'matchesQuery — АБО: немає жодного', run: () => matches('samsung || nokia'), expected: false },
    { name: 'matchesQuery — НЕ: терма немає', run: () => matches('!max'), expected: true },
    { name: 'matchesQuery — НЕ: терм є', run: () => matches('!pro'), expected: false },
    { name: 'matchesQuery — ТА з НЕ', run: () => matches('iphone && !max'), expected: true },
    { name: 'matchesQuery — самотній «!» нічого не забороняє', run: () => matches('!'), expected: true },
    { name: 'matchesQuery — лише «||» без термів', run: () => matches('||'), expected: false },
    { name: 'matchesQuery — порожня група після «||» не заважає', run: () => matches('iphone ||'), expected: true },

    { name: 'hasSearchOperators — є оператор', run: () => hasSearchOperators('iphone && pro'), expected: true },
    { name: 'hasSearchOperators — звичайний запит', run: () => hasSearchOperators('iphone 13'), expected: false },
    { name: 'hasSearchOperators — порожній запит', run: () => hasSearchOperators(''), expected: false },

    { name: 'extractSearchTerms — лише позитивні терми', run: () => extractSearchTerms('iphone && !max || pro'), expected: ['iphone', 'pro'] },
    { name: 'extractSearchTerms — порожній запит', run: () => extractSearchTerms('  '), expected: [] },

    { name: 'toHighlightQuery — без операторів: сам рядок', run: () => toHighlightQuery('13'), expected: '13' },
    { name: 'toHighlightQuery — з операторами: терми', run: () => toHighlightQuery('iphone || !max'), expected: ['iphone'] },
  ]);
});
