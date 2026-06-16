import { create } from 'zustand';
import type { ListingStatus } from '../types';

interface ListingsUiState {
  statusFilter: ListingStatus | 'all';
  setStatusFilter: (v: ListingStatus | 'all') => void;
}

export const useListingsUiStore = create<ListingsUiState>((set) => ({
  statusFilter: 'all',
  setStatusFilter: (v) => set({ statusFilter: v }),
}));
