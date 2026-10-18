import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Facet категорій OLX (docs/olx-api.md §2.11): fetch замокано — жодних запитів до OLX.
const logWarn = vi.hoisted(() => vi.fn());
vi.mock('../../logger.js', () => ({ logWarn, logError: vi.fn() }));

import { fetchCategoryFacet } from './categories.js';

const CATS = [
  { id: 37, count: 120, label: 'Електроніка', url: 'https://www.olx.ua/uk/elektronika/q-iphone/' },
  { id: 80, count: 40, label: 'Ноутбуки', url: 'https://www.olx.ua/uk/elektronika/noutbuki/q-iphone/' },
];

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const success = (category: unknown) => ({
  data: { clientCompatibleListings: { __typename: 'ListingSuccess', metadata: { facets: { category } } } },
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  logWarn.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchCategoryFacet', () => {
  it('успіх: facet категорій, один POST до GraphQL, без журналу', async () => {
    fetchMock.mockResolvedValueOnce(json(success(CATS)));
    expect(await fetchCategoryFacet('  iphone  ')).toEqual(CATS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://www.olx.ua/apigateway/graphql');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as { variables: { searchParameters: Array<{ key: string; value: string }> } };
    expect(body.variables.searchParameters).toContainEqual({ key: 'query', value: 'iphone' });
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('порожній запит → null без запиту', async () => {
    expect(await fetchCategoryFacet('   ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['не-200', () => new Response('Forbidden', { status: 403 }), 'HTTP 403'],
    ['GraphQL errors', () => json({ errors: [{ message: 'Cannot query field' }] }), 'Cannot query field'],
    [
      'ListingError',
      () =>
        json({
          data: {
            clientCompatibleListings: { __typename: 'ListingError', error: { code: 'X', status: 400, title: 'bad' } },
          },
        }),
      'ListingError code=X',
    ],
    ['порожній facet', () => json(success([])), 'порожній facet'],
    ['без clientCompatibleListings', () => json({ data: {} }), 'без clientCompatibleListings'],
  ])('%s → null і запис у журнал', async (_name, response, text) => {
    fetchMock.mockResolvedValueOnce(response());
    expect(await fetchCategoryFacet('iphone')).toBeNull();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledWith('scanner', 'category-facet', expect.stringContaining(text), {
      query: 'iphone',
    });
  });

  it('мережевий збій → null і запис у журнал, без винятку', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await fetchCategoryFacet('iphone')).toBeNull();
    expect(logWarn).toHaveBeenCalledWith('scanner', 'category-facet', 'fetch failed', { query: 'iphone' });
  });
});
