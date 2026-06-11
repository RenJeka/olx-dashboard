// Усі OLX-селектори в одному місці (підтверджені в CLAUDE.md / spec §4.1).
// Якщо OLX змінить розмітку — правити лише тут.

export const SELECTORS = {
  card: '[data-cy="l-card"]',
  title: 'h6, h4', // OLX мігрував заголовок картки з h6 на h4 — тримаємо обидва

  price: '[data-testid="ad-price"]',
  link: 'a[href]',
  locationDate: '[data-testid="location-date"]',
  image: 'img',
  emptyState: '[data-cy="empty-state"]',

  // detail-сторінка (для майбутніх етапів; зараз не використовується)
  detailParams: '[data-cy="ad-params"] li',
  detailDescription: '[data-testid="ad_description"]',
  detailTrader: '[data-testid="trader-title"]',
} as const;

export const OLX_BASE_URL = 'https://www.olx.ua';

// Обовʼязкові заголовки запиту (spec §4.1).
export const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; rv:91.0) Gecko/20100101 Firefox/91.0',
  'X-Client': 'DESKTOP',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
} as const;
