import type { Listing, ListingStatus } from '../types';
import { isMutedStatus } from './status';

export type StatusFilter = ListingStatus | 'all' | 'ai_picks';

/**
 * Чи рядок проходить «шумові» перемикачі над таблицею
 * (показ відфільтрованих / нерелевантних). Це база лічильників на вкладках.
 */
export function passesNoiseFilters(
  l: Listing,
  showFilteredOut: boolean,
  showIrrelevant: boolean,
): boolean {
  return (showFilteredOut || l.filtered_out === 0) && (showIrrelevant || l.ai_relevant !== 0);
}

/**
 * Предикат вкладки «Найкращі кандидати»: без мінусів, активні (не disabled/rejected),
 * не відфільтровані, релевантні. Перемикачі шуму тут ігноруються свідомо.
 */
export function isAiPickCandidate(l: Listing): boolean {
  return !l.cons && !isMutedStatus(l.status) && l.filtered_out === 0 && l.ai_relevant !== 0;
}

/**
 * Єдине джерело правди видимості рядка в таблиці за поточними фільтрами
 * (вкладка статусу + перемикачі шуму). Тим САМИМ предикатом має керуватися
 * обсяг AI-аналізу — щоб «число в дужках на вкладці» і «скільки піде в аналіз»
 * завжди збігалися.
 */
export function isListingVisible(
  l: Listing,
  statusFilter: StatusFilter,
  showFilteredOut: boolean,
  showIrrelevant: boolean,
): boolean {
  if (statusFilter === 'ai_picks') return isAiPickCandidate(l);
  return (
    passesNoiseFilters(l, showFilteredOut, showIrrelevant) &&
    (statusFilter === 'all' || l.status === statusFilter)
  );
}
