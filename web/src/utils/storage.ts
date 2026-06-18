import type { VisibilityState } from '@tanstack/react-table';
import type { StoredTableState } from '../types';
import {
  DEFAULT_ANALYSIS_MODEL,
  DEFAULT_AUTO_REFRESH_INTERVAL_MIN,
  DEFAULT_PAGE_SIZE,
  SETTINGS_STORAGE_KEY,
  TABLE_STORAGE_KEY,
} from '../constants';

// Реекспорт для зворотної сумісності наявних імпортів зі storage.
export {
  DEFAULT_ANALYSIS_MODEL,
  DEFAULT_AUTO_REFRESH_INTERVAL_MIN,
  DEFAULT_PAGE_SIZE,
  SETTINGS_STORAGE_KEY,
  TABLE_STORAGE_KEY,
};

interface StoredSettings {
  columnVisibility?: VisibilityState;
  columnOrder?: string[];
  descriptionExpandEnabled?: boolean;
  autoRefreshEnabled?: boolean;
  autoRefreshIntervalMin?: number;
  skipDeepScanConfirm?: boolean;
  searchesVisible?: boolean;
  analysisModel?: string;
  analysisReasoning?: boolean;
  analysisExtraCriteria?: string;
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredSettings;
  } catch {
    return {};
  }
}

function saveSettings(patch: Partial<StoredSettings>): void {
  try {
    const current = loadSettings();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Ignore storage write errors
  }
}

export function loadColumnVisibility(): VisibilityState {
  const saved = loadSettings().columnVisibility ?? {};
  // Нові колонки, яких ще немає у збереженому стані — приховані за замовчуванням
  const defaults: VisibilityState = { pros: false, cons: false, ai_rank: false };
  return { ...defaults, ...saved };
}

export function saveColumnVisibility(columnVisibility: VisibilityState): void {
  saveSettings({ columnVisibility });
}

export function loadColumnOrder(): string[] {
  return loadSettings().columnOrder ?? [];
}

export function saveColumnOrder(columnOrder: string[]): void {
  saveSettings({ columnOrder });
}

export function loadDescriptionExpandEnabled(): boolean {
  return loadSettings().descriptionExpandEnabled ?? true;
}

export function saveDescriptionExpandEnabled(descriptionExpandEnabled: boolean): void {
  saveSettings({ descriptionExpandEnabled });
}

export function loadAutoRefreshEnabled(): boolean {
  return loadSettings().autoRefreshEnabled ?? false;
}

export function saveAutoRefreshEnabled(autoRefreshEnabled: boolean): void {
  saveSettings({ autoRefreshEnabled });
}

export function loadAutoRefreshIntervalMin(): number {
  return loadSettings().autoRefreshIntervalMin ?? DEFAULT_AUTO_REFRESH_INTERVAL_MIN;
}

export function saveAutoRefreshIntervalMin(autoRefreshIntervalMin: number): void {
  saveSettings({ autoRefreshIntervalMin });
}

export function loadSkipDeepScanConfirm(): boolean {
  return loadSettings().skipDeepScanConfirm ?? false;
}

export function saveSkipDeepScanConfirm(skipDeepScanConfirm: boolean): void {
  saveSettings({ skipDeepScanConfirm });
}

export function loadSearchesVisible(): boolean {
  return loadSettings().searchesVisible ?? true;
}

export function saveSearchesVisible(searchesVisible: boolean): void {
  saveSettings({ searchesVisible });
}

export function loadAnalysisModel(): string {
  return loadSettings().analysisModel || DEFAULT_ANALYSIS_MODEL;
}

export function saveAnalysisModel(analysisModel: string): void {
  saveSettings({ analysisModel });
}

export function loadAnalysisReasoning(): boolean {
  return loadSettings().analysisReasoning ?? false;
}

export function saveAnalysisReasoning(analysisReasoning: boolean): void {
  saveSettings({ analysisReasoning });
}

export function loadAnalysisExtraCriteria(): string {
  return loadSettings().analysisExtraCriteria ?? '';
}

export function saveAnalysisExtraCriteria(analysisExtraCriteria: string): void {
  saveSettings({ analysisExtraCriteria });
}

export function loadTableState(): StoredTableState {
  try {
    const raw = localStorage.getItem(TABLE_STORAGE_KEY);
    if (!raw) return { columnSizing: {}, sorting: [], pageSize: DEFAULT_PAGE_SIZE };
    const parsed = JSON.parse(raw) as Partial<StoredTableState>;
    return {
      columnSizing: parsed.columnSizing ?? {},
      sorting: parsed.sorting ?? [],
      pageSize: parsed.pageSize ?? DEFAULT_PAGE_SIZE,
    };
  } catch {
    return { columnSizing: {}, sorting: [], pageSize: DEFAULT_PAGE_SIZE };
  }
}

export function saveTableState(state: StoredTableState): void {
  try {
    localStorage.setItem(TABLE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors
  }
}
