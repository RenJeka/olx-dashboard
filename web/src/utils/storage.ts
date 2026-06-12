import type { VisibilityState } from '@tanstack/react-table';
import type { StoredTableState } from '../types';

export const SETTINGS_STORAGE_KEY = 'olx-ui-settings-v1';
export const TABLE_STORAGE_KEY = 'olx-listings-table-v1';
export const DEFAULT_PAGE_SIZE = 50;

interface StoredSettings {
  columnVisibility?: VisibilityState;
  descriptionExpandEnabled?: boolean;
  autoRefreshEnabled?: boolean;
  autoRefreshIntervalMin?: number;
  skipDeepScanConfirm?: boolean;
  searchesVisible?: boolean;
}

export const DEFAULT_AUTO_REFRESH_INTERVAL_MIN = 30;

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
  return loadSettings().columnVisibility ?? {};
}

export function saveColumnVisibility(columnVisibility: VisibilityState): void {
  saveSettings({ columnVisibility });
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
