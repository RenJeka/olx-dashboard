import type { VisibilityState } from '@tanstack/react-table';
import type { StoredTableState } from '../types';

export const SETTINGS_STORAGE_KEY = 'olx-ui-settings-v1';
export const TABLE_STORAGE_KEY = 'olx-listings-table-v1';

export function loadColumnVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { columnVisibility?: VisibilityState };
    return parsed.columnVisibility ?? {};
  } catch {
    return {};
  }
}

export function saveColumnVisibility(columnVisibility: VisibilityState): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ columnVisibility }));
  } catch {
    // Ignore storage write errors
  }
}

export function loadTableState(): StoredTableState {
  try {
    const raw = localStorage.getItem(TABLE_STORAGE_KEY);
    if (!raw) return { columnSizing: {}, sorting: [] };
    const parsed = JSON.parse(raw) as Partial<StoredTableState>;
    return {
      columnSizing: parsed.columnSizing ?? {},
      sorting: parsed.sorting ?? [],
    };
  } catch {
    return { columnSizing: {}, sorting: [] };
  }
}

export function saveTableState(state: StoredTableState): void {
  try {
    localStorage.setItem(TABLE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors
  }
}
