import { useAnalysisWizardStore } from '../../stores/analysisWizardStore';
import { useAnalysisStatus, useSavedCriteria } from '../../api';
import { useAiScope } from './useAiScope';
import { useAnalysisCriteria } from './useAnalysisCriteria';
import { useAnalysisMatching } from './useAnalysisMatching';
import { useAnalysisReview } from './useAnalysisReview';
import { useAnalysisCommit } from './useAnalysisCommit';
import { MODE_LABELS } from '../../constants';
import { buildScopeLabel, getDefaultScope } from '../../utils/aiScope';
import type { Search } from '../../types';

/**
 * Тонкий оркестратор логіки AI-аналізу (майстер з 4 кроків).
 * Об'єднує всі доменні хуки (scope, criteria, matching, review, commit)
 * в один об'єкт для зворотної сумісності з компонентами майстра.
 */
export function useWizard(search: Search, selectedIds: number[], open: boolean) {
  const store = useAnalysisWizardStore();
  const { mode } = store;

  const { data: status } = useAnalysisStatus();
  const { data: savedCriteria } = useSavedCriteria(open ? search.id : null);
  const apiAvailable = status?.apiAvailable ?? false;
  const modeLabel = MODE_LABELS[mode];

  // Compose sub-hooks
  const scopeHook = useAiScope(search.id, selectedIds, open, store.scope);
  const criteriaHook = useAnalysisCriteria(search.id, savedCriteria);
  const matchingHook = useAnalysisMatching(search.id, scopeHook.effectiveIds);
  const reviewHook = useAnalysisReview(search.id, scopeHook.listingById);
  const commitHook = useAnalysisCommit(search.id, reviewHook.commitItems, reviewHook.overwriteCount, apiAvailable);

  return {
    // Identity
    searchId: search.id,
    
    // Store state (pass-through for components that still need it directly)
    mode: store.mode, setMode: store.setMode,
    scope: store.scope, setScope: store.setScope,
    step: store.step, setStep: store.setStep,
    available: store.available,
    selected: store.selected,
    customInput: store.customInput, setCustomInput: store.setCustomInput,
    accumulated: store.accumulated,
    criteriaLoadedMode: store.criteriaLoadedMode, setCriteriaLoadedMode: store.setCriteriaLoadedMode,
    bindSearch: store.bindSearch, reset: store.reset,
    
    // Global/Computed computed from top-level
    apiAvailable, modeLabel, savedCriteria,
    computeDefaultScope: () => getDefaultScope(selectedIds, scopeHook.statusFilter),
    scopeLabel: buildScopeLabel(store.scope, scopeHook.statusFilter),
    
    // Extracted from hooks
    ...scopeHook,
    ...criteriaHook,
    ...matchingHook,
    ...reviewHook,
    ...commitHook,
  };
}
