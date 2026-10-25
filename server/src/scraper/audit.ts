/**
 * Аудит запитів застосунку до OLX (docs/plans/olx-api-audit.md, P-017): кожен запит — живий? структура
 * відповіді збігається з еталоном (`olxAuditEtalon.json`)? Запити будуються тими самими функціями, що й скан,
 * тож аудит бачить саме те, що бачить застосунок. Розбіжність = OLX щось змінив (docs/olx-api.md §5).
 */
import * as cheerio from 'cheerio';
import type { SearchConfig } from '../types.js';
import { BATCH_PAUSE_MAX_MS, BATCH_PAUSE_MIN_MS, MAX_DELAY_MS, MIN_DELAY_MS } from './constants.js';
import { buildCategoryFacetParams } from './graphql/categories.js';
import { GraphqlClient, graphqlHeaders } from './graphql/client.js';
import { CATEGORY_FACET_QUERY, GRAPHQL_URL, LISTING_SEARCH_QUERY } from './graphql/constants.js';
import { HtmlOlxFetcher } from './olxFetcher.js';
import { REQUEST_HEADERS, SELECTORS } from './selectors.js';
import { randomDelayMs, sleep, slugify } from './utils.js';

export const AUDIT_PROBES = ['graphql-search', 'graphql-facets', 'html-search', 'html-listing'] as const;
export type AuditProbeId = (typeof AUDIT_PROBES)[number];

export const AUDIT_PROBE_LABELS: Record<AuditProbeId, string> = {
  'graphql-search': 'GraphQL пошук',
  'graphql-facets': 'GraphQL категорії (facets)',
  'html-search': 'HTML сторінка пошуку',
  'html-listing': 'HTML сторінка оголошення',
};

/** Знімок однієї відповіді: те, що звіряємо з еталоном. */
export interface AuditSnapshot {
  /** HTTP-статус (null — мережева помилка). */
  status: number | null;
  /** Тип відповіді без параметрів (`application/json`, `text/html`). */
  contentType: string | null;
  /** JSON — шляхи полів (`a.b[].c`); HTML — знайдені селектори (`selector:card`). Відсортовано. */
  shape: string[];
}

export type AuditEtalon = Partial<Record<AuditProbeId, AuditSnapshot>>;

export interface AuditDiff {
  statusChanged: boolean;
  typeChanged: boolean;
  /** Є в еталоні, немає в живій відповіді — OLX прибрав чи перейменував. */
  missing: string[];
  /** Нове в живій відповіді. */
  added: string[];
}

export interface AuditRow {
  id: AuditProbeId;
  url: string;
  live: AuditSnapshot;
  /** Еталону для запиту ще немає → null. */
  diff: AuditDiff | null;
  /** Мережева помилка чи інша причина без HTTP-статусу. */
  error: string | null;
}

/** Шляхи полів JSON: об'єкти — `a.b`, масиви — `a[]` (елементи об'єднуються). `null` — лише сам шлях. */
export function jsonShape(value: unknown): string[] {
  const paths = new Set<string>();
  const walk = (node: unknown, prefix: string): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, `${prefix}[]`);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.add(path);
      walk(child, path);
    }
  };
  walk(value, '');
  return [...paths].sort();
}

/** Які селектори знайдено в HTML (`selector:<назва з SELECTORS>`). */
export function htmlShape(html: string, keys: readonly (keyof typeof SELECTORS)[]): string[] {
  const $ = cheerio.load(html);
  return keys.filter((key) => $(SELECTORS[key]).length > 0).map((key) => `selector:${key}`).sort();
}

export function mediaType(header: string | null): string | null {
  return header ? (header.split(';')[0] ?? '').trim().toLowerCase() : null;
}

export function compareSnapshot(etalon: AuditSnapshot, live: AuditSnapshot): AuditDiff {
  const liveSet = new Set(live.shape);
  const etalonSet = new Set(etalon.shape);
  return {
    statusChanged: etalon.status !== live.status,
    typeChanged: etalon.contentType !== live.contentType,
    missing: etalon.shape.filter((p) => !liveSet.has(p)),
    added: live.shape.filter((p) => !etalonSet.has(p)),
  };
}

export function hasDiff(diff: AuditDiff | null): boolean {
  return diff !== null && (diff.statusChanged || diff.typeChanged || diff.missing.length > 0 || diff.added.length > 0);
}

interface ProbeOutcome {
  url: string;
  live: AuditSnapshot;
  error: string | null;
  /** Розібраний JSON (для URL оголошення з пошуку). */
  json?: unknown;
}

const HTML_SEARCH_KEYS = ['card', 'title', 'price', 'link', 'locationDate'] as const;
const HTML_LISTING_KEYS = ['detailDescription', 'detailParams', 'detailSellerName', 'detailTrader'] as const;

async function request(
  url: string,
  init: RequestInit,
  shapeOf: (body: string, type: string | null) => { shape: string[]; json?: unknown },
): Promise<ProbeOutcome> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const contentType = mediaType(res.headers.get('content-type'));
    const body = await res.text();
    const { shape, json } = res.status === 200 ? shapeOf(body, contentType) : { shape: [], json: undefined };
    return { url, live: { status: res.status, contentType, shape }, error: null, json };
  } catch (err) {
    return {
      url,
      live: { status: null, contentType: null, shape: [] },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseJsonShape(body: string): { shape: string[]; json?: unknown } {
  try {
    const json: unknown = JSON.parse(body);
    return { shape: jsonShape(json), json };
  } catch {
    return { shape: ['<не-JSON>'] };
  }
}

/** Перший URL оголошення з відповіді GraphQL-пошуку (для проби сторінки оголошення). */
function firstListingUrl(json: unknown): string | null {
  const data = (json as { data?: { clientCompatibleListings?: { data?: Array<{ url?: unknown }> } } } | undefined)
    ?.data?.clientCompatibleListings?.data;
  const url = Array.isArray(data) ? data.find((item) => typeof item.url === 'string')?.url : undefined;
  return typeof url === 'string' ? url : null;
}

/**
 * Проходить усі запити по черзі з паузами звичайного скану (1–2 с; перед 4-м — пауза батча 3–6 с).
 * `onProbe` — для прогресу в CLI.
 */
export async function runOlxAudit(
  query: string,
  etalon: AuditEtalon,
  onProbe?: (id: AuditProbeId) => void,
): Promise<AuditRow[]> {
  const search: SearchConfig = { id: 0, name: 'olx-audit', query, apiFilters: {} };
  const referer = `https://www.olx.ua/uk/list/q-${slugify(query)}/`;
  const outcomes = new Map<AuditProbeId, ProbeOutcome>();

  onProbe?.('graphql-search');
  outcomes.set(
    'graphql-search',
    await request(
      GRAPHQL_URL,
      {
        method: 'POST',
        headers: graphqlHeaders(referer),
        body: JSON.stringify({
          query: LISTING_SEARCH_QUERY,
          variables: { searchParameters: new GraphqlClient().buildSearchParameters(search, 0) },
        }),
      },
      parseJsonShape,
    ),
  );

  await sleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS));
  onProbe?.('graphql-facets');
  outcomes.set(
    'graphql-facets',
    await request(
      GRAPHQL_URL,
      {
        method: 'POST',
        headers: graphqlHeaders(referer),
        body: JSON.stringify({
          query: CATEGORY_FACET_QUERY,
          variables: { searchParameters: buildCategoryFacetParams(query) },
        }),
      },
      parseJsonShape,
    ),
  );

  await sleep(randomDelayMs(MIN_DELAY_MS, MAX_DELAY_MS));
  onProbe?.('html-search');
  const searchUrl = new HtmlOlxFetcher().buildUrl(search, 1);
  outcomes.set(
    'html-search',
    await request(searchUrl, { headers: { ...REQUEST_HEADERS, Referer: searchUrl } }, (body) => ({
      shape: htmlShape(body, HTML_SEARCH_KEYS),
    })),
  );

  await sleep(randomDelayMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS));
  onProbe?.('html-listing');
  const listingUrl = firstListingUrl(outcomes.get('graphql-search')?.json);
  outcomes.set(
    'html-listing',
    listingUrl
      ? await request(listingUrl, { headers: REQUEST_HEADERS, redirect: 'manual' }, (body) => ({
          shape: htmlShape(body, HTML_LISTING_KEYS),
        }))
      : {
          url: '—',
          live: { status: null, contentType: null, shape: [] },
          error: 'немає URL оголошення: GraphQL-пошук не повернув оголошень',
        },
  );

  return AUDIT_PROBES.map((id) => {
    const outcome = outcomes.get(id)!;
    const base = etalon[id];
    return {
      id,
      url: outcome.url,
      live: outcome.live,
      diff: base ? compareSnapshot(base, outcome.live) : null,
      error: outcome.error,
    };
  });
}
