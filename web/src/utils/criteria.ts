// Категорії критеріїв мінусів/плюсів на фронті (docs/plans/criteria-categories.md). Дзеркало частини
// server/src/analysis/criteria.ts: ключ формулювання й поглинання згенерованих синонімів.
import type { AnalysisMode, CriterionGroup, Listing } from '../types';
import { parseBullets } from './localFilters';

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

/** Скільки оголошень містить кожне формулювання (ключ phraseKey) у полі режиму. */
export function countPhrases(listings: Listing[], mode: AnalysisMode): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of listings) {
    const keys = new Set(parseBullets(l[mode]).map(phraseKey));
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Скільки оголошень має хоча б одне з формулювань `keys` (для «зачепить N оголошень»). */
export function countListingsWithAny(listings: Listing[], mode: AnalysisMode, keys: Set<string>): number {
  return listings.filter((l) => parseBullets(l[mode]).some((b) => keys.has(phraseKey(b)))).length;
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
