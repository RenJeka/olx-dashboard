import type { MatchedItem } from '../types';
import type { AnalysisScope } from '../stores/analysisWizardStore';
import type { StatusFilter } from './listingVisibility';
import { buildScopeLabel as buildAiScopeLabel } from './aiScope';

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
  return buildAiScopeLabel(scope, statusFilter as StatusFilter);
}
