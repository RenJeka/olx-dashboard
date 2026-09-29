import { create } from 'zustand';
import type { AnalysisMode, AnalyzedListing } from '../types';
import type { AiScope } from '../utils/aiScope';

type Updater<T> = T | ((prev: T) => T);

function applyUpdater<T>(prev: T, updaterOrValue: Updater<T>): T {
  return typeof updaterOrValue === 'function'
    ? (updaterOrValue as (prev: T) => T)(prev)
    : updaterOrValue;
}

/** Обсяг майстра = спільний `AiScope` (вкл. «candidates»). */
export type AnalysisScope = AiScope;

interface AnalysisWizardState {
  boundSearchId: number | null;
  criteriaLoadedMode: AnalysisMode | null;
  // Flow state
  mode: AnalysisMode;
  scope: AnalysisScope;
  step: number;
  available: string[];
  selected: Set<string>;
  customInput: string;
  accumulated: AnalyzedListing[];
  includedOverrides: Map<string, boolean>;
  // Setters
  setMode: (v: AnalysisMode) => void;
  setScope: (v: AnalysisScope) => void;
  setStep: (v: number) => void;
  setAvailable: (v: Updater<string[]>) => void;
  setSelected: (v: Updater<Set<string>>) => void;
  setCustomInput: (v: string) => void;
  setAccumulated: (v: AnalyzedListing[]) => void;
  setIncludedOverrides: (v: Updater<Map<string, boolean>>) => void;
  setCriteriaLoadedMode: (v: AnalysisMode | null) => void;
  // Actions
  bindSearch: (id: number) => void;
  reset: () => void;
}

const INITIAL_FLOW: Pick<
  AnalysisWizardState,
  'mode' | 'scope' | 'step' | 'available' | 'selected' | 'customInput' | 'accumulated' | 'includedOverrides'
> = {
  mode: 'cons',
  scope: 'all',
  step: 1,
  available: [],
  selected: new Set(),
  customInput: '',
  accumulated: [],
  includedOverrides: new Map(),
};

export const useAnalysisWizardStore = create<AnalysisWizardState>((set, get) => ({
  boundSearchId: null,
  criteriaLoadedMode: null,
  ...INITIAL_FLOW,

  setMode: (v) => set({ mode: v }),
  setScope: (v) => set({ scope: v }),
  setStep: (v) => set({ step: v }),
  setAvailable: (v) => set((s) => ({ available: applyUpdater(s.available, v) })),
  setSelected: (v) => set((s) => ({ selected: applyUpdater(s.selected, v) })),
  setCustomInput: (v) => set({ customInput: v }),
  setAccumulated: (v) => set({ accumulated: v }),
  setIncludedOverrides: (v) => set((s) => ({ includedOverrides: applyUpdater(s.includedOverrides, v) })),
  setCriteriaLoadedMode: (v) => set({ criteriaLoadedMode: v }),

  bindSearch: (id) => {
    if (id !== get().boundSearchId) {
      set({ ...INITIAL_FLOW, boundSearchId: id, criteriaLoadedMode: null });
    }
  },

  reset: () => set({ ...INITIAL_FLOW, boundSearchId: null, criteriaLoadedMode: null }),
}));
