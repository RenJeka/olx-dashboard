/**
 * Дерево категорій OLX для запиту через GraphQL `metadata.facets.category` (docs/olx-api.md §2.11).
 * Замінює REST `/api/v1/offers/metadata/search/` (з 2026-10-17 віддає 403). Один легкий запит
 * (`limit=1` — самі оголошення не потрібні). Best-effort: будь-який збій → запис у журнал і `null`.
 */
import { logWarn } from '../../logger.js';
import type { FacetCategory } from '../../types.js';
import { slugify } from '../utils.js';
import { graphqlHeaders } from './client.js';
import { CATEGORY_FACET_LIMIT, CATEGORY_FACET_QUERY, GRAPHQL_URL } from './constants.js';
import type { SearchParameter } from './types.js';

interface CategoryFacetResponse {
  data?: {
    clientCompatibleListings?:
      | {
          __typename: 'ListingSuccess';
          metadata?: { facets?: { category?: FacetCategory[] | null } | null } | null;
        }
      | {
          __typename: 'ListingError';
          error?: { code?: string; title?: string; detail?: string; status?: number };
        };
  };
  errors?: Array<{ message: string }>;
}

/** `searchParameters` запиту facet категорій (спільні для `fetchCategoryFacet` і аудиту OLX). */
export function buildCategoryFacetParams(query: string): SearchParameter[] {
  return [
    { key: 'query', value: query },
    { key: 'offset', value: '0' },
    { key: 'limit', value: '1' },
    {
      key: 'facets',
      value: JSON.stringify([
        { field: 'category', fetchLabel: true, fetchUrl: true, limit: CATEGORY_FACET_LIMIT },
      ]),
    },
  ];
}

/**
 * Тягне facet категорій для пошукового запиту. Не-200, `ListingError`, помилка схеми, порожній facet,
 * мережевий збій → `logWarn('scanner', 'category-facet', …)` і `null` (виклик лишає старе дерево).
 */
export async function fetchCategoryFacet(query: string): Promise<FacetCategory[] | null> {
  const q = query.trim();
  if (!q) return null;

  const searchParameters = buildCategoryFacetParams(q);

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: graphqlHeaders(`https://www.olx.ua/uk/list/q-${slugify(q)}/`),
      body: JSON.stringify({ query: CATEGORY_FACET_QUERY, variables: { searchParameters } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logWarn('scanner', 'category-facet', `OLX GraphQL facets: HTTP ${res.status}`, { query: q });
      return null;
    }
    const json = (await res.json()) as CategoryFacetResponse;
    if (json.errors && json.errors.length > 0) {
      logWarn(
        'scanner',
        'category-facet',
        `OLX GraphQL facets: ${json.errors.map((e) => e.message).join('; ')}`,
        { query: q },
      );
      return null;
    }
    const result = json.data?.clientCompatibleListings;
    if (!result) {
      logWarn('scanner', 'category-facet', 'OLX GraphQL facets: відповідь без clientCompatibleListings', {
        query: q,
      });
      return null;
    }
    if (result.__typename === 'ListingError') {
      const e = result.error ?? {};
      logWarn(
        'scanner',
        'category-facet',
        `OLX GraphQL facets: ListingError code=${e.code ?? '?'} status=${e.status ?? '?'} title="${e.title ?? ''}"`,
        { query: q },
      );
      return null;
    }
    const cats = result.metadata?.facets?.category;
    if (!Array.isArray(cats) || cats.length === 0) {
      logWarn('scanner', 'category-facet', 'OLX GraphQL facets: порожній facet категорій', { query: q });
      return null;
    }
    return cats;
  } catch (err) {
    logWarn('scanner', 'category-facet', err instanceof Error ? err.message : String(err), {
      query: q,
    });
    return null;
  }
}
