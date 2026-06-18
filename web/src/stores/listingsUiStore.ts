import { create } from 'zustand';
import type { ListingStatus } from '../types';

interface ListingsUiState {
  statusFilter: ListingStatus | 'all' | 'ai_picks';
  setStatusFilter: (v: ListingStatus | 'all' | 'ai_picks') => void;
  showFilteredOut: boolean;
  setShowFilteredOut: (v: boolean) => void;
  showIrrelevant: boolean;
  setShowIrrelevant: (v: boolean) => void;
}

export const useListingsUiStore = create<ListingsUiState>((set) => ({
  statusFilter: 'all',
  setStatusFilter: (v) => set({ statusFilter: v }),
  showFilteredOut: false,
  setShowFilteredOut: (v) => set({ showFilteredOut: v }),
  showIrrelevant: false,
  setShowIrrelevant: (v) => set({ showIrrelevant: v }),
}));
