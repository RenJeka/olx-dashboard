import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RowSelectionState, VisibilityState } from '@tanstack/react-table';
import { SETTINGS_STORAGE_KEY, DEFAULT_AUTO_REFRESH_INTERVAL_MIN, DEFAULT_ANALYSIS_MODEL } from '../constants';

interface SettingsState {
  // Ефемерний стан (не персиститься)
  selectedSearchId: number | null;
  setSelectedSearchId: (id: number | null) => void;
  
  rowSelection: RowSelectionState;
  setRowSelection: (v: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void;

  // Персистентний стан
  columnVisibility: VisibilityState;
  setColumnVisibility: (v: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => void;
  
  columnOrder: string[];
  setColumnOrder: (order: string[]) => void;
  
  descriptionExpandEnabled: boolean;
  setDescriptionExpandEnabled: (enabled: boolean) => void;
  
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  
  autoRefreshIntervalMin: number;
  setAutoRefreshIntervalMin: (intervalMin: number) => void;
  
  searchesVisible: boolean;
  setSearchesVisible: (visible: boolean) => void;

  skipDeepScanConfirm: boolean;
  setSkipDeepScanConfirm: (skip: boolean) => void;

  analysisModel: string;
  setAnalysisModel: (model: string) => void;

  analysisReasoning: boolean;
  setAnalysisReasoning: (reasoning: boolean) => void;

  analysisExtraCriteria: string;
  setAnalysisExtraCriteria: (criteria: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedSearchId: null,
      setSelectedSearchId: (id) => set({ selectedSearchId: id, rowSelection: {} }), // Скидаємо виділення при зміні пошуку
      
      rowSelection: {},
      setRowSelection: (v) =>
        set((state) => ({
          rowSelection: typeof v === 'function' ? v(state.rowSelection) : v,
        })),

      columnVisibility: { pros: false, cons: false, ai_rank: false }, // Дефолти
      setColumnVisibility: (v) =>
        set((state) => ({
          columnVisibility: typeof v === 'function' ? v(state.columnVisibility) : v,
        })),

      columnOrder: [],
      setColumnOrder: (columnOrder) => set({ columnOrder }),

      descriptionExpandEnabled: true,
      setDescriptionExpandEnabled: (descriptionExpandEnabled) => set({ descriptionExpandEnabled }),

      autoRefreshEnabled: false,
      setAutoRefreshEnabled: (autoRefreshEnabled) => set({ autoRefreshEnabled }),

      autoRefreshIntervalMin: DEFAULT_AUTO_REFRESH_INTERVAL_MIN,
      setAutoRefreshIntervalMin: (autoRefreshIntervalMin) => set({ autoRefreshIntervalMin }),

      searchesVisible: true,
      setSearchesVisible: (searchesVisible) => set({ searchesVisible }),

      skipDeepScanConfirm: false,
      setSkipDeepScanConfirm: (skipDeepScanConfirm) => set({ skipDeepScanConfirm }),

      analysisModel: DEFAULT_ANALYSIS_MODEL,
      setAnalysisModel: (analysisModel) => set({ analysisModel }),

      analysisReasoning: false,
      setAnalysisReasoning: (analysisReasoning) => set({ analysisReasoning }),

      analysisExtraCriteria: '',
      setAnalysisExtraCriteria: (analysisExtraCriteria) => set({ analysisExtraCriteria }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      partialize: (state) => ({
        columnVisibility: state.columnVisibility,
        columnOrder: state.columnOrder,
        descriptionExpandEnabled: state.descriptionExpandEnabled,
        autoRefreshEnabled: state.autoRefreshEnabled,
        autoRefreshIntervalMin: state.autoRefreshIntervalMin,
        searchesVisible: state.searchesVisible,
        skipDeepScanConfirm: state.skipDeepScanConfirm,
        analysisModel: state.analysisModel,
        analysisReasoning: state.analysisReasoning,
        analysisExtraCriteria: state.analysisExtraCriteria,
      }),
    }
  )
);
