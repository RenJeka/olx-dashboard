import { useEffect, useState } from 'react';
import type { ColumnSizingState, PaginationState, SortingState } from '@tanstack/react-table';
import { loadTableState, saveTableState } from '../utils/storage';

export function useListingsTableState() {
  const [sorting, setSorting] = useState<SortingState>(() => loadTableState().sorting);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    () => loadTableState().columnSizing,
  );
  const [pagination, setPagination] = useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: loadTableState().pageSize,
  }));

  useEffect(() => {
    saveTableState({ columnSizing, sorting, pageSize: pagination.pageSize });
  }, [columnSizing, sorting, pagination.pageSize]);

  return {
    sorting,
    setSorting,
    columnSizing,
    setColumnSizing,
    pagination,
    setPagination,
  };
}
