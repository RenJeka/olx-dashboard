/**
 * Дерево категорій OLX для пошукового запиту — через facet ендпойнт метаданих пошуку.
 *
 * Перевірено live 2026-06-23 (docs/olx-api.md §2.11, пам'ять olx-category-facet-endpoint):
 *   GET /api/v1/offers/metadata/search/?query=<q>&facets=[{field:category,fetchLabel,fetchUrl,limit}]
 *   → data.facets.category[] = { id, count, label, url }
 * `label` — людська назва, `count` — лічильник OLX для запиту, `url` — слаг-шлях, що кодує
 * ПОВНУ ієрархію (`/hobbi-otdyh-i-sport/velo/velosipedy/q-<q>`). Кожен предок присутній окремим
 * елементом (його count ≥ count нащадка), тож дерево назв будується суто з цієї відповіді.
 *
 * (Старий словник `/api/v1/categories/` — deprecated/access denied; `search-categories/` дає лише
 * {id,count} без назв. Тому використовуємо саме facet метаданих пошуку.)
 */
import { USER_AGENT } from './constants.js';
import type { CategoryOption } from '../types.js';

const SEARCH_METADATA_URL = 'https://www.olx.ua/api/v1/offers/metadata/search/';

/** Скільки категорій тягнути у facet (вистачає з запасом навіть для широких запитів). */
const CATEGORY_FACET_LIMIT = 100;

interface FacetCategory {
  id: number;
  count: number;
  label: string;
  url: string;
}

/** Слаги шляху з url категорії: відкидаємо хвіст `/q-...`, лишаємо сегменти шляху. */
function slugPath(url: string): string[] {
  const pathPart = url.split('/q-')[0] ?? url;
  return pathPart.split('/').filter(Boolean);
}

/**
 * Перетворює facet-масив на CategoryOption[] (id + повний шлях НАЗВ root→leaf + OLX-лічильник).
 * Назви предків резолвимо через мапу «власний слаг → label» (власний слаг = останній у url).
 */
function buildOptions(cats: FacetCategory[]): CategoryOption[] {
  const slugToLabel = new Map<string, string>();
  const parsed = cats.map((c) => {
    const slugs = slugPath(c.url);
    const ownSlug = slugs[slugs.length - 1] ?? String(c.id);
    slugToLabel.set(ownSlug, c.label);
    return { c, slugs };
  });

  return parsed.map(({ c, slugs }) => ({
    id: c.id,
    olxCount: c.count,
    path: slugs.map((s) => slugToLabel.get(s) ?? s),
  }));
}

/**
 * Тягне дерево категорій OLX для запиту й повертає CategoryOption[].
 * Best-effort: мережева/форматна помилка чи порожній facet → null (виклик зберігає старе дерево).
 */
export async function fetchCategoryOptions(query: string): Promise<CategoryOption[] | null> {
  if (!query.trim()) return null;

  const facets = encodeURIComponent(
    JSON.stringify([
      { field: 'category', fetchLabel: true, fetchUrl: true, limit: CATEGORY_FACET_LIMIT },
    ]),
  );
  const url = `${SEARCH_METADATA_URL}?query=${encodeURIComponent(query)}&facets=${facets}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { facets?: { category?: FacetCategory[] } } };
    const cats = json.data?.facets?.category;
    if (!Array.isArray(cats) || cats.length === 0) return null;
    return buildOptions(cats);
  } catch {
    return null;
  }
}
