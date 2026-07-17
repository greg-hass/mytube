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
				deepseekApiKey: state.deepseekApiKey,
				customApiKey: state.customApiKey,
				llmProvider: state.llmProvider,
				llmApiKey: state.llmApiKey,
				llmModel: state.llmModel,
				quotaUsed: state.quotaUsed,
				apiExhausted: state.apiExhausted,
				lastQuotaResetDate: state.lastQuotaResetDate,
				watchedVideos: Array.from(state.watchedVideos),
			}),
			merge: (persistedState, currentState) => {
				const persisted = persistedState as Partial<AppState> & {
					watchedVideos?: string[];
				};
				const safePersisted = Object.fromEntries(
					Object.entries(persisted).filter(
						([key]) => key !== "braveApiKey" && key !== "opencodeApiKey",
					),
				);
				return {
					...currentState,
					...safePersisted,
					llmProvider:
						persisted.llmProvider === "opencode"
							? "deepseek"
							: persisted.llmProvider ?? currentState.llmProvider,
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
