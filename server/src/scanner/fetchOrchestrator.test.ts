import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithFallback, graphqlFetcher, htmlFetcher } from './fetchOrchestrator.js';
import { HTML_FALLBACK_ENABLED } from '../scraper/constants.js';
import type { SearchConfig } from '../types.js';

// S4: OLX (CloudFront) відповідає 403 на HTML-сторінки — fallback вимкнено, скан падає
// з причиною GraphQL і не робить жодного HTML-запиту.
const search = { id: 1, query: 'iphone' } as SearchConfig;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithFallback — HTML-fallback вимкнено', () => {
  it('прапорець вимкнено', () => {
    expect(HTML_FALLBACK_ENABLED).toBe(false);
  });

  it('GraphQL упав → помилка з причиною GraphQL, HTML-фетчер не викликається', async () => {
    vi.spyOn(graphqlFetcher, 'fetchSearch').mockRejectedValue(new Error('ListingError: boom'));
    const html = vi.spyOn(htmlFetcher, 'fetchSearch');

    await expect(fetchWithFallback(search)).rejects.toThrow(
      'graphql failed: ListingError: boom; html fallback вимкнено',
    );
    expect(html).not.toHaveBeenCalled();
  });
});
