import type { Listing, RelevanceItem } from '../types';

export type Scope = 'selected' | 'tab' | 'all';

/**
 * Визначає список ID оголошень, які підлягають класифікації, залежно від обраного Scope.
 */
export function getEffectiveRelevanceIds(
  scope: Scope,
  selectedIds: number[],
  statusFilter: string,
  listings: Listing[] | undefined
): number[] {
  const all = listings ?? [];
  if (scope === 'selected') {
    return selectedIds;
  }
  if (scope === 'tab') {
    return all.filter((l) => l.status === statusFilter).map((l) => l.id);
  }
  return all.map((l) => l.id);
}

/**
 * Визначає дефолтний Scope залежно від вибраних ID та поточного фільтра.
 */
export function getDefaultScope(selectedIds: number[], statusFilter: string): Scope {
  if (selectedIds.length > 0) return 'selected';
  if (statusFilter !== 'all' && statusFilter !== 'ai_picks') return 'tab';
  return 'all';
}

/**
 * Встановлює, чи є елемент релевантним, враховуючи ручні виправлення.
 */
export function isItemRelevant(item: RelevanceItem, overrides: Map<number, boolean>): boolean {
  return overrides.has(item.id) ? (overrides.get(item.id) as boolean) : item.relevant;
}

/**
 * Отримує статистику за результатами класифікації (кількість нерелевантних та авто-відсіяних).
 */
export function getRelevanceStats(results: RelevanceItem[], overrides: Map<number, boolean>) {
  const irrelevantCount = results.filter((r) => !isItemRelevant(r, overrides)).length;
  const autoRejectedCount = results.filter((r) => r.reason.startsWith('Авто-відсіяно')).length;
  
  return { irrelevantCount, autoRejectedCount };
}
