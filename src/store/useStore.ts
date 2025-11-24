import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createUISlice, type UISlice } from './createUISlice';
import { createDataSlice, type DataSlice } from './createDataSlice';

type AppState = UISlice & DataSlice;

// Initialize quota reset checker
function initQuotaResetListener() {
  // Check for quota reset every minute
  setInterval(() => {
    useStore.getState().checkQuotaReset();
  }, 60000); // 60 seconds
}

export const useStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createUISlice(...a),
      ...createDataSlice(...a),
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        theme: state.theme,
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        apiKey: state.apiKey,
        useApiForVideos: state.useApiForVideos,
        quotaUsed: state.quotaUsed,
        apiExhausted: state.apiExhausted,
        lastQuotaResetDate: state.lastQuotaResetDate,
      }),
    }
  )
);

// Start the quota reset checker
initQuotaResetListener();
