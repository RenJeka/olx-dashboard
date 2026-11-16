import { afterAll, beforeAll, describe, expect, vi } from 'vitest';
import { BASE_TIME, makeListing } from '../test/factories';
import { runCases } from '../test/table';
import {
  countProsConsItems,
  formatAiUsage,
  formatDate,
  formatDuration,
  formatNumber,
  formatPrice,
  formatPriceRange,
  formatRelativeTime,
  parsePriceRange,
  pluralUk,
  stripDescriptionHtml,
} from './format';

// Рядок на виході — і є результат цих функцій, тож порівнюємо його цілком. Пробіли-розділювачі розрядів
// залежать від даних локалі — зводимо їх до звичайного пробілу.
const plain = (text: string | null) => text?.replace(/\s/g, ' ') ?? null;
const forms: [string, string, string] = ['синонім', 'синоніми', 'синонімів'];
const NOW = new Date(BASE_TIME).getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Час — зовнішнє: «зараз» зафіксовано, щоб «X тому» не залежало від годинника.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe('format', () => {
  runCases([
    { name: 'formatPrice — ціна з валютою', run: () => plain(formatPrice(makeListing({ price: 12500 }))), expected: '12 500 UAH' },
    { name: 'formatPrice — без ціни', run: () => formatPrice(makeListing({ price: null })), expected: '—' },

    {
      name: 'parsePriceRange — обидві межі',
      run: () => parsePriceRange(JSON.stringify({ ranges: { price: { from: 1000, to: 5000 } } })),
      expected: { from: 1000, to: 5000 },
    },
    { name: 'parsePriceRange — діапазон без меж', run: () => parsePriceRange(JSON.stringify({ ranges: { price: {} } })), expected: null },
    { name: 'parsePriceRange — фільтрів немає', run: () => parsePriceRange(''), expected: null },
    { name: 'parsePriceRange — зіпсований JSON', run: () => parsePriceRange('не json'), expected: null },

    { name: 'formatPriceRange — обидві межі', run: () => plain(formatPriceRange(1000, 5000)), expected: '1 000 – 5 000 грн' },
    { name: 'formatPriceRange — лише нижня', run: () => plain(formatPriceRange(1000, null)), expected: 'від 1 000 грн' },
    { name: 'formatPriceRange — лише верхня', run: () => plain(formatPriceRange(undefined, 5000)), expected: 'до 5 000 грн' },
    { name: 'formatPriceRange — нуль теж межа', run: () => plain(formatPriceRange(0, null)), expected: 'від 0 грн' },
    { name: 'formatPriceRange — без меж', run: () => formatPriceRange(), expected: null },

    { name: 'pluralUk — 1', run: () => pluralUk(1, forms), expected: forms[0] },
    { name: 'pluralUk — 3', run: () => pluralUk(3, forms), expected: forms[1] },
    { name: 'pluralUk — 5', run: () => pluralUk(5, forms), expected: forms[2] },
    { name: 'pluralUk — 0', run: () => pluralUk(0, forms), expected: forms[2] },
    { name: 'pluralUk — 11 і 12 — виняток', run: () => [pluralUk(11, forms), pluralUk(12, forms)], expected: [forms[2], forms[2]] },
    { name: 'pluralUk — 21 і 22', run: () => [pluralUk(21, forms), pluralUk(22, forms)], expected: [forms[0], forms[1]] },

    { name: 'formatDate — без дати', run: () => formatDate(null), expected: null },
    { name: 'formatDate — не дата: показуємо як є', run: () => formatDate('не дата'), expected: { short: 'не дата', full: 'не дата' } },
    {
      name: 'formatDate — київський час: пізній вечір UTC — уже наступний день',
      run: () => formatDate('2026-06-10T22:30:00Z'),
      expected: { short: expect.stringMatching(/^11\s.*2026/), full: expect.stringMatching(/^11\s.*2026.*01:30/) },
    },

    { name: 'formatRelativeTime — менше хвилини', run: () => formatRelativeTime(ago(30_000)), expected: 'щойно' },
    { name: 'formatRelativeTime — хвилини', run: () => formatRelativeTime(ago(5 * MINUTE)), expected: '5 хв тому' },
    { name: 'formatRelativeTime — рівно година', run: () => formatRelativeTime(ago(HOUR)), expected: '1 год тому' },
    { name: 'formatRelativeTime — дні', run: () => formatRelativeTime(ago(49 * HOUR)), expected: '2 дн тому' },
    { name: 'formatRelativeTime — не дата: показуємо як є', run: () => formatRelativeTime('не дата'), expected: 'не дата' },

    { name: 'formatNumber — розділювачі розрядів', run: () => plain(formatNumber(1234567)), expected: '1 234 567' },

    { name: 'formatDuration — секунди', run: () => formatDuration(45), expected: '~45 с' },
    { name: 'formatDuration — не менше секунди', run: () => formatDuration(0.2), expected: '~1 с' },
    { name: 'formatDuration — рівно хвилина', run: () => formatDuration(60), expected: '~1 хв' },
    { name: 'formatDuration — хвилини', run: () => formatDuration(170), expected: '~3 хв' },

    { name: 'countProsConsItems — пункти без порожніх рядків', run: () => countProsConsItems('• коробка\n• чек\n\n'), expected: 2 },
    { name: 'countProsConsItems — без тексту', run: () => [countProsConsItems(null), countProsConsItems('')], expected: [0, 0] },

    {
      name: 'stripDescriptionHtml — теги, переноси й ентіті',
      run: () => stripDescriptionHtml('<p>Стан <b>новий</b><br />Торг &amp; обмін&nbsp;можливі</p>'),
      expected: 'Стан новий\nТорг & обмін можливі',
    },
    { name: 'stripDescriptionHtml — екранований тег лишається текстом', run: () => stripDescriptionHtml('&lt;script&gt;'), expected: '<script>' },
    { name: 'stripDescriptionHtml — без опису', run: () => stripDescriptionHtml(null), expected: '' },

    {
      name: 'formatAiUsage — запити й вартість із чотирма знаками',
      run: () => formatAiUsage({ requests: 120, cost: 0.00421 }),
      expected: expect.stringMatching(/120.*\$0\.0042$/),
    },
  ]);
});
