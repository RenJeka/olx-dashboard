/**
 * Дерево категорій OLX для пошукового запиту — чисті перетворення facet → CategoryOption[] / CategoryNode[].
 *
 * Джерело — GraphQL `metadata.facets.category[]` = { id, count, label, url } (scraper/graphql/categories.ts,
 * docs/olx-api.md §2.11). `label` — людська назва, `count` — лічильник OLX для запиту, `url` — слаг-шлях,
 * що кодує ПОВНУ ієрархію (`/hobbi-otdyh-i-sport/velo/velosipedy/q-<q>`). Кожен предок присутній окремим
 * елементом (його count ≥ count нащадка), тож дерево назв будується суто з цієї відповіді.
 *
 * (REST `/api/v1/offers/metadata/search/` з 2026-10-17 віддає 403 — замінено на GraphQL.)
 */
import type { CategoryNode, CategoryOption, FacetCategory } from '../types.js';

/** Слаги шляху з url категорії: відкидаємо origin і хвіст `/q-...`, лишаємо сегменти шляху. */
function slugPath(url: string): string[] {
  let pathname = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }
  }
  const pathPart = pathname.split('/q-')[0] ?? pathname;
  return pathPart.split('/').filter(Boolean);
}

/**
 * Перетворює facet-масив на CategoryOption[] (id + повний шлях НАЗВ root→leaf + OLX-лічильник).
 * Назви предків резолвимо через мапу «власний слаг → label» (власний слаг = останній у url).
 */
export function facetToOptions(cats: FacetCategory[]): CategoryOption[] {
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
 * Перетворює facet-масив на плоский список вузлів дерева (id, parentId, label, власний slug).
 * Батько — елемент відповіді, чий повний слаг-шлях збігається з шляхом цього без останнього сегмента;
 * якщо предка у відповіді немає — `parentId: null`.
 */
export function facetToNodes(cats: FacetCategory[]): CategoryNode[] {
  const parsed = cats.map((c) => ({ c, slugs: slugPath(c.url) }));
  const idByPath = new Map<string, number>();
  for (const { c, slugs } of parsed) idByPath.set(slugs.join('/'), c.id);

  return parsed.map(({ c, slugs }) => ({
    id: c.id,
    parentId: slugs.length > 1 ? (idByPath.get(slugs.slice(0, -1).join('/')) ?? null) : null,
    label: c.label,
    slug: slugs[slugs.length - 1] ?? String(c.id),
  }));
}
