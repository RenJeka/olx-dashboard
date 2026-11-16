import type { MatchedItem } from '../types';

export function criterionKey(id: number, criterion: string): string {
  return `${id}:${criterion.toLowerCase()}`;
}

export function isIncludedFn(overrides: Map<string, boolean>, id: number, item: MatchedItem): boolean {
  return overrides.get(criterionKey(id, item.criterion)) ?? item.ok;
}
