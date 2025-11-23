import type { StateCreator } from 'zustand';

// Helper function to get current date in Pacific Time
function getCurrentPacificDate(): string {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    };
    return new Intl.DateTimeFormat('en-US', options).format(now);
}

export interface DataSlice {
    apiKey: string;
    useApiForVideos: boolean;
    quotaUsed: number;
    lastQuotaResetDate: string;
    watchedVideos: Set<string>;

    setApiKey: (key: string) => void;
    toggleUseApiForVideos: () => void;
    incrementQuota: (amount: number) => void;
    resetQuota: () => void;
    checkQuotaReset: () => void;
    markAsWatched: (videoId: string) => void;
    markAsUnwatched: (videoId: string) => void;
    isWatched: (videoId: string) => boolean;
}

export const createDataSlice: StateCreator<DataSlice> = (set, get) => ({
    apiKey: '',
    useApiForVideos: false,
    quotaUsed: 0,
    lastQuotaResetDate: getCurrentPacificDate(),
    watchedVideos: new Set<string>(),

    setApiKey: (key) => set({ apiKey: key }),

    toggleUseApiForVideos: () => set((state) => ({
        useApiForVideos: !state.useApiForVideos
    })),

    incrementQuota: (amount) => set((state) => ({
        quotaUsed: state.quotaUsed + amount
    })),

    resetQuota: () => set({ quotaUsed: 0 }),

    checkQuotaReset: () => {
        const state = get();
        const currentDate = getCurrentPacificDate();

        if (currentDate !== state.lastQuotaResetDate) {
            console.log(`📅 New day in Pacific Time (${currentDate}). Resetting quota.`);
            set({
                quotaUsed: 0,
                lastQuotaResetDate: currentDate,
            });
        }
    },

    markAsWatched: (videoId) => set((state) => {
        const newWatched = new Set(state.watchedVideos);
        newWatched.add(videoId);
        return { watchedVideos: newWatched };
    }),

    markAsUnwatched: (videoId) => set((state) => {
        const newWatched = new Set(state.watchedVideos);
        newWatched.delete(videoId);
        return { watchedVideos: newWatched };
    }),

    isWatched: (videoId) => get().watchedVideos.has(videoId),
});
