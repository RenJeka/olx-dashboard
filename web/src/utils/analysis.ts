import type { MatchedItem } from '../types';
import type { AnalysisScope } from '../stores/analysisWizardStore';
import { AI_PICKS_LABEL } from '../constants';
import { STATUS_LABELS } from './status';

export function computeDefaultScope(selectedIds: number[], statusFilter: string): AnalysisScope {
  if (selectedIds.length > 0) return 'selected';
  if (statusFilter !== 'all') return 'tab';
  return 'all';
}

export function criterionKey(id: number, criterion: string): string {
  return `${id}:${criterion.toLowerCase()}`;
}

export function isIncludedFn(overrides: Map<string, boolean>, id: number, item: MatchedItem): boolean {
  return overrides.get(criterionKey(id, item.criterion)) ?? item.ok;
}

export function buildScopeLabel(scope: AnalysisScope, statusFilter: string): string {
  if (scope === 'selected') return 'Вибрані';
  if (scope === 'tab' && statusFilter === 'ai_picks') return AI_PICKS_LABEL;
  if (scope === 'tab' && statusFilter !== 'all') {
    return STATUS_LABELS[statusFilter as keyof typeof STATUS_LABELS];
  }
  return 'Весь пошук';
}
