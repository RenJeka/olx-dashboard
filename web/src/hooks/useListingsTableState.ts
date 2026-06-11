import { useEffect, useState } from 'react';
import type { ColumnSizingState, SortingState } from '@tanstack/react-table';
import { loadTableState, saveTableState } from '../utils/storage';

export function useListingsTableState() {
  const [sorting, setSorting] = useState<SortingState>(() => loadTableState().sorting);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    () => loadTableState().columnSizing,
  );

  useEffect(() => {
    saveTableState({ columnSizing, sorting });
  }, [columnSizing, sorting]);

  return {
    sorting,
    setSorting,
    columnSizing,
    setColumnSizing,
  };
}
