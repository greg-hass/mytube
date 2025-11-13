import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewMode, SortBy } from '../types/youtube';

interface AppState {
  // Auth
  isAuthenticated: boolean;
  accessToken: string | null;
  setAuth: (token: string | null) => void;
  logout: () => void;

  // UI
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      isAuthenticated: false,
      accessToken: null,
      setAuth: (token) => set({ accessToken: token, isAuthenticated: !!token }),
      logout: () => set({ accessToken: null, isAuthenticated: false }),

      // UI
      theme: 'dark',
      toggleTheme: () =>
        set((state) => {
          const newTheme = state.theme === 'light' ? 'dark' : 'light';
          if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          return { theme: newTheme };
        }),
      viewMode: 'grid',
      setViewMode: (mode) => set({ viewMode: mode }),
      sortBy: 'name',
      setSortBy: (sort) => set({ sortBy: sort }),
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
    }),
    {
      name: 'youtube-subs-storage',
      partialize: (state) => ({
        theme: state.theme,
        viewMode: state.viewMode,
        sortBy: state.sortBy,
      }),
    }
  )
);
