import type { VisibilityState } from '@tanstack/react-table';
import type { StoredTableState } from '../types';

export const SETTINGS_STORAGE_KEY = 'olx-ui-settings-v1';
export const TABLE_STORAGE_KEY = 'olx-listings-table-v1';
export const DEFAULT_PAGE_SIZE = 50;

interface StoredSettings {
  columnVisibility?: VisibilityState;
  descriptionExpandEnabled?: boolean;
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
