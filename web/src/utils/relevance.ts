import type { RelevanceItem } from '../types';

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
