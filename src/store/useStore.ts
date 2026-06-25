import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createUISlice, type UISlice } from "./createUISlice";
import { createDataSlice, type DataSlice } from "./createDataSlice";

type AppState = UISlice & DataSlice;

export const useStore = create<AppState>()(
	persist(
		(...a) => ({
			...createUISlice(...a),
			...createDataSlice(...a),
		}),
		{
			name: "app-storage",
			partialize: (state) => ({
				theme: state.theme,
				viewMode: state.viewMode,
				sortBy: state.sortBy,
				apiKey: state.apiKey,
				braveApiKey: state.braveApiKey,
				opencodeApiKey: state.opencodeApiKey,
				quotaUsed: state.quotaUsed,
				apiExhausted: state.apiExhausted,
				lastQuotaResetDate: state.lastQuotaResetDate,
				watchedVideos: Array.from(state.watchedVideos),
			}),
			merge: (persistedState, currentState) => {
				const persisted = persistedState as Partial<AppState> & {
					watchedVideos?: string[];
				};
				return {
					...currentState,
					...persisted,
					watchedVideos: new Set(
						Array.isArray(persisted.watchedVideos)
							? persisted.watchedVideos
							: [],
					),
				};
			},
		},
	),
);
