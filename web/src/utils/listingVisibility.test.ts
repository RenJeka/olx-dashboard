import { describe } from 'vitest';
import { makeListing } from '../test/factories';
import { runCases } from '../test/table';
import { isAiPickCandidate, isListingVisible, passesNoiseFilters, previewHideReason } from './listingVisibility';

const plain = makeListing();
const filteredOut = makeListing({ filtered_out: 1 });
const irrelevant = makeListing({ ai_relevant: 0 });
const withCons = makeListing({ cons: '• подряпини' });
/** Фільтр, який ховає типове оголошення (воно з Києва). */
const otherCity = { cities: ['Львів'] };

describe('listingVisibility', () => {
  runCases([
    { name: 'passesNoiseFilters — типове оголошення', run: () => passesNoiseFilters(plain, false, false), expected: true },
    { name: 'passesNoiseFilters — відфільтроване сховано', run: () => passesNoiseFilters(filteredOut, false, false), expected: false },
    { name: 'passesNoiseFilters — відфільтроване показано перемикачем', run: () => passesNoiseFilters(filteredOut, true, false), expected: true },
    { name: 'passesNoiseFilters — нерелевантне сховано', run: () => passesNoiseFilters(irrelevant, false, false), expected: false },
    { name: 'passesNoiseFilters — нерелевантне показано перемикачем', run: () => passesNoiseFilters(irrelevant, false, true), expected: true },
    {
      name: 'passesNoiseFilters — без вердикту AI рядок видно',
      run: () => passesNoiseFilters(makeListing({ ai_relevant: null }), false, false),
      expected: true,
    },

    { name: 'previewHideReason — без фільтрів рядок видно', run: () => previewHideReason(plain, {}, false, false), expected: null },
    { name: 'previewHideReason — сховано фільтрами', run: () => previewHideReason(plain, otherCity, false, false), expected: 'filters' },
    {
      name: 'previewHideReason — нерелевантне має пріоритет над фільтрами',
      run: () => previewHideReason(irrelevant, otherCity, false, false),
      expected: 'irrelevant',
    },
    {
      name: 'previewHideReason — нерелевантне показано, фільтри все одно ховають',
      run: () => previewHideReason(irrelevant, otherCity, false, true),
      expected: 'filters',
    },
    {
      name: 'previewHideReason — збережений filtered_out не враховується, лише нові фільтри',
      run: () => previewHideReason(filteredOut, {}, false, false),
      expected: null,
    },

    { name: 'isAiPickCandidate — типове оголошення', run: () => isAiPickCandidate(plain), expected: true },
    { name: 'isAiPickCandidate — релевантне за AI', run: () => isAiPickCandidate(makeListing({ ai_relevant: 1 })), expected: true },
    { name: 'isAiPickCandidate — з мінусами', run: () => isAiPickCandidate(withCons), expected: false },
    { name: 'isAiPickCandidate — вимкнене', run: () => isAiPickCandidate(makeListing({ status: 'disabled' })), expected: false },
    { name: 'isAiPickCandidate — відфільтроване', run: () => isAiPickCandidate(filteredOut), expected: false },
    { name: 'isAiPickCandidate — нерелевантне', run: () => isAiPickCandidate(irrelevant), expected: false },

    { name: 'isListingVisible — вкладка «Всі»', run: () => isListingVisible(plain, 'all', false, false), expected: true },
    { name: 'isListingVisible — вкладка свого статусу', run: () => isListingVisible(plain, 'new', false, false), expected: true },
    { name: 'isListingVisible — вкладка іншого статусу', run: () => isListingVisible(plain, 'contacted', false, false), expected: false },
    {
      name: 'isListingVisible — кандидати ігнорують перемикачі шуму',
      run: () => isListingVisible(filteredOut, 'ai_picks', true, true),
      expected: false,
    },
  ]);
});
