import type { Listing } from '../types';
import { isAiPickCandidate, isListingVisible, type StatusFilter } from './listingVisibility';
import { AI_PICKS_LABEL } from '../constants';
import { STATUS_LABELS } from './status';

/**
 * Єдине джерело правди «обсягу» AI-операцій (спільне для фільтра релевантності,
 * майстра «Плюси/Мінуси» та «AI Picks»). Чотири взаємовиключні обсяги:
 * - all        — геть усі рядки пошуку (вкл. відфільтровані/нерелевантні);
 * - tab         — рівно те, що зараз показано в таблиці активної вкладки (з шумовими перемикачами);
 * - selected    — лише позначені чекбоксами рядки;
 * - candidates  — «найкращі кандидати» (isAiPickCandidate): без мінусів, активні, не відфільтровані, релевантні.
 */
export type AiScope = 'all' | 'tab' | 'selected' | 'candidates';

export interface ScopeContext {
  listings: Listing[] | undefined;
  selectedIds: number[];
  statusFilter: StatusFilter;
  showFilteredOut: boolean;
  showIrrelevant: boolean;
}

export interface ScopeCounts {
  all: number;
  tab: number;
  selected: number;
  candidates: number;
}

/** Список ID оголошень для заданого обсягу. */
export function getScopeIds(scope: AiScope, ctx: ScopeContext): number[] {
  const all = ctx.listings ?? [];
  switch (scope) {
    case 'selected':
      return ctx.selectedIds;
    case 'tab':
      return all
        .filter((l) => isListingVisible(l, ctx.statusFilter, ctx.showFilteredOut, ctx.showIrrelevant))
        .map((l) => l.id);
    case 'candidates':
      return all.filter(isAiPickCandidate).map((l) => l.id);
    case 'all':
    default:
      return all.map((l) => l.id);
  }
}

/** Лічильники для всіх обсягів (для підписів-кнопок селектора). */
export function getScopeCounts(ctx: ScopeContext): ScopeCounts {
  return {
    all: getScopeIds('all', ctx).length,
    tab: getScopeIds('tab', ctx).length,
    selected: ctx.selectedIds.length,
    candidates: getScopeIds('candidates', ctx).length,
  };
}

/**
 * Дефолтний обсяг. `preferCandidates` (для «AI Picks») завжди → `candidates`;
 * інакше: є виділення → `selected`; конкретна вкладка → `tab`; «Всі» → `all`.
 */
export function getDefaultScope(
  selectedIds: number[],
  statusFilter: StatusFilter,
  opts?: { preferCandidates?: boolean },
): AiScope {
  if (opts?.preferCandidates) return 'candidates';
  if (selectedIds.length > 0) return 'selected';
  if (statusFilter !== 'all') return 'tab';
  return 'all';
}

/** Назва активної вкладки для підпису обсягу «таб». */
export function tabName(statusFilter: StatusFilter): string {
  if (statusFilter === 'all') return 'Всі';
  if (statusFilter === 'ai_picks') return AI_PICKS_LABEL;
  return STATUS_LABELS[statusFilter];
}

/** Короткий підпис обсягу (для степпера майстра тощо). */
export function buildScopeLabel(scope: AiScope, statusFilter: StatusFilter): string {
  switch (scope) {
    case 'selected':
      return 'Вибрані';
    case 'tab':
      return `У таблиці (Вкладка "${tabName(statusFilter)}")`;
    case 'candidates':
      return AI_PICKS_LABEL;
    case 'all':
    default:
      return 'Весь пошук';
  }
}
