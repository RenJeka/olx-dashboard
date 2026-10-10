// Категорії критеріїв мінусів/плюсів на фронті (docs/plans/criteria-categories.md). Дзеркало частини
// server/src/analysis/criteria.ts: ключ формулювання й поглинання згенерованих синонімів.
import type { AnalysisMode, CriterionGroup, Listing } from '../types';
import { parseBullets } from './localFilters';
import { sortAlpha } from './sort';

/** Згортання пробілів + trim. */
export function cleanCriterion(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Ключ порівняння формулювань: без регістру й зайвих пробілів. */
export function phraseKey(value: string): string {
  return cleanCriterion(value).toLowerCase();
}

/** Мапа «формулювання (назва чи синонім) → назва категорії». */
export function aliasLookup(groups: CriterionGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    map.set(phraseKey(g.name), g.name);
    for (const a of g.aliases) map.set(phraseKey(a), g.name);
  }
  return map;
}

/**
 * Згенеровані / імпортовані / введені формулювання → нові увімкнені категорії. Збіг із назвою чи синонімом
 * наявної поглинається нею (не з'являється окремим чипом). `added` — назви нових категорій.
 */
export function absorbIncoming(
  groups: CriterionGroup[],
  incoming: string[],
): { groups: CriterionGroup[]; added: string[] } {
  const known = aliasLookup(groups);
  const out = [...groups];
  const added: string[] = [];
  for (const raw of incoming) {
    const name = cleanCriterion(raw);
    const key = phraseKey(name);
    if (!key || known.has(key)) continue;
    known.set(key, name);
    out.push({ name, aliases: [], enabled: true });
    added.push(name);
  }
  return { groups: out, added };
}

/** Скільки оголошень (набори ключів їхніх пунктів) мають хоча б одне з формулювань `keys`. */
export function countListingsWithAny(listingKeys: Set<string>[], keys: Iterable<string>): number {
  const wanted = [...keys];
  return listingKeys.filter((lk) => wanted.some((k) => lk.has(k))).length;
}

/**
 * Порядок показу: спершу категорії (є синоніми), далі окремі критерії — кожна частина за алфавітом.
 * Спільне для вікна «Плюси та мінуси» й чипів майстра.
 */
export function categoriesFirst(names: string[], isCategory: (name: string) => boolean): [string[], string[]] {
  return [sortAlpha(names.filter(isCategory)), sortAlpha(names.filter((n) => !isCategory(n)))];
}

/** Усі ключі формулювань категорії (назва + синоніми). */
export function groupKeys(g: CriterionGroup): string[] {
  return [g.name, ...g.aliases].map(phraseKey);
}

/** Пункти, що є в оголошеннях, але не належать жодній категорії (перший варіант написання). */
export function orphanPhrases(listings: Listing[], mode: AnalysisMode, groups: CriterionGroup[]): string[] {
  const known = aliasLookup(groups);
  const seen = new Map<string, string>();
  for (const l of listings) {
    for (const b of parseBullets(l[mode])) {
      const key = phraseKey(b);
      if (!known.has(key) && !seen.has(key)) seen.set(key, cleanCriterion(b));
    }
  }
  return [...seen.values()];
}
