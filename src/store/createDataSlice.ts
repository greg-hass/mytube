import type { StateCreator } from "zustand";
import { getCurrentDateInTimezone } from "../lib/date-helpers";

const QUOTA_TIMEZONE = "America/Los_Angeles";

function getCurrentPacificDate(): string {
	return getCurrentDateInTimezone(QUOTA_TIMEZONE);
}

export interface DataSlice {
	apiKey: string;
	deepseekApiKey: string;
	customApiKey: string;
	useApiForVideos: boolean;
	quotaUsed: number;
	apiExhausted: boolean;
	lastQuotaResetDate: string;
	watchedVideos: Set<string>;
	llmProvider: string;
	llmApiKey: string;
	llmModel: string;

	setApiKey: (key: string) => void;
	setDeepseekApiKey: (key: string) => void;
	setCustomApiKey: (key: string) => void;
	setLlmProvider: (provider: string) => void;
	setLlmApiKey: (key: string) => void;
	setLlmModel: (model: string) => void;
	toggleUseApiForVideos: () => void;
	incrementQuota: (amount: number) => void;
	setQuota: (amount: number) => void;
	setApiExhausted: (exhausted: boolean) => void;
	resetQuota: () => void;
	checkQuotaReset: () => void;
	markAsWatched: (videoId: string) => void;
	markAsUnwatched: (videoId: string) => void;
	setWatchedVideos: (videos: string[]) => void;
	isWatched: (videoId: string) => boolean;
}

export const createDataSlice: StateCreator<DataSlice> = (set, get) => ({
	apiKey: "",
	deepseekApiKey: "",
	customApiKey: "",
	llmProvider: "deepseek",
	llmApiKey: "",
	llmModel: "deepseek-v4-flash",
	useApiForVideos: false,
	quotaUsed: 0,
	apiExhausted: false,
	lastQuotaResetDate: getCurrentPacificDate(),
	watchedVideos: new Set<string>(),

	setApiKey: (key) => set({ apiKey: key }),
	setDeepseekApiKey: (key) => set({ deepseekApiKey: key }),
	setCustomApiKey: (key) => set({ customApiKey: key }),
	setLlmProvider: (provider) => set({ llmProvider: provider }),
	setLlmApiKey: (key) => set({ llmApiKey: key }),
	setLlmModel: (model) => set({ llmModel: model }),

	toggleUseApiForVideos: () =>
		set((state) => ({
			useApiForVideos: !state.useApiForVideos,
		})),

	incrementQuota: (amount) =>
		set((state) => ({
			quotaUsed: state.quotaUsed + amount,
		})),

	setQuota: (amount) => set({ quotaUsed: amount }),

	setApiExhausted: (exhausted) => set({ apiExhausted: exhausted }),

	resetQuota: () => set({ quotaUsed: 0, apiExhausted: false }),

	checkQuotaReset: () => {
		const state = get();
		const currentDate = getCurrentPacificDate();

		if (currentDate !== state.lastQuotaResetDate) {
			console.log(
				`📅 New day in Pacific Time (${currentDate}). Resetting quota.`,
			);
			set({
				quotaUsed: 0,
				lastQuotaResetDate: currentDate,
			});
		}
	},

	markAsWatched: (videoId) =>
		set((state) => {
			const newWatched = new Set(state.watchedVideos);
			newWatched.add(videoId);
			return { watchedVideos: newWatched };
		}),

	markAsUnwatched: (videoId) =>
		set((state) => {
			const newWatched = new Set(state.watchedVideos);
			newWatched.delete(videoId);
			return { watchedVideos: newWatched };
		}),

	setWatchedVideos: (videos) => set({ watchedVideos: new Set(videos) }),

	isWatched: (videoId) => get().watchedVideos.has(videoId),
});
