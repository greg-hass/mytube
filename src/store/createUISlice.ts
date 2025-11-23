import type { StateCreator } from 'zustand';
import type { SortBy } from '../types/youtube';

export interface UISlice {
    theme: 'light' | 'dark';
    viewMode: 'grid' | 'list';
    sortBy: SortBy;
    searchQuery: string;

    // Video filters
    dateRangeStart: string | null;
    dateRangeEnd: string | null;
    selectedChannelIds: string[];
    showWatchedOnly: boolean;

    toggleTheme: () => void;
    setViewMode: (mode: 'grid' | 'list') => void;
    setSortBy: (sortBy: SortBy) => void;
    setSearchQuery: (query: string) => void;

    // Filter actions
    setDateRange: (start: string | null, end: string | null) => void;
    setSelectedChannels: (channelIds: string[]) => void;
    toggleShowWatchedOnly: () => void;
    clearFilters: () => void;
}

export const createUISlice: StateCreator<UISlice> = (set) => ({
    theme: 'dark',
    viewMode: 'grid',
    sortBy: 'recent',
    searchQuery: '',

    // Filter state
    dateRangeStart: null,
    dateRangeEnd: null,
    selectedChannelIds: [],
    showWatchedOnly: false,

    toggleTheme: () => set((state) => ({
        theme: state.theme === 'light' ? 'dark' : 'light'
    })),

    setViewMode: (mode) => set({ viewMode: mode }),
    setSortBy: (sortBy) => set({ sortBy }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    // Filter actions
    setDateRange: (start, end) => set({
        dateRangeStart: start,
        dateRangeEnd: end
    }),

    setSelectedChannels: (channelIds) => set({
        selectedChannelIds: channelIds
    }),

    toggleShowWatchedOnly: () => set((state) => ({
        showWatchedOnly: !state.showWatchedOnly
    })),

    clearFilters: () => set({
        dateRangeStart: null,
        dateRangeEnd: null,
        selectedChannelIds: [],
        showWatchedOnly: false,
    }),
});
