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
