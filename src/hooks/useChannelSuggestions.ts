/**
 * useChannelSuggestions — state machine for on-demand channel
 * suggestions via the LLM provider. Triggered by user tapping
 * "Discover Channels" in the Add Channel modal.
 *
 * The caller provides the current subscription list so the LLM
 * can personalise suggestions.
 */
import { useCallback, useState } from "react";
import { useStore } from "../store/useStore";
import type { YouTubeChannel } from "../types/youtube";

type SuggestionState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "error"; message: string }
	| { phase: "results"; channels: YouTubeChannel[] };

export function useChannelSuggestions() {
	const [state, setState] = useState<SuggestionState>({ phase: "idle" });

	const fetchSuggestions = useCallback(
		async (subscriptions: YouTubeChannel[]) => {
			setState({ phase: "loading" });

			try {
				const { llmProvider, llmApiKey, llmModel } = useStore.getState();
				const headers: HeadersInit = {};

				// Build LLM provider headers
				if (llmProvider) headers["X-Llm-Provider"] = llmProvider;
				if (llmApiKey) headers["X-Llm-Api-Key"] = llmApiKey;
				if (llmModel) headers["X-Llm-Model"] = llmModel;

				// Also include the OpenCode key header as fallback
				const { opencodeApiKey } = useStore.getState();
				if (opencodeApiKey) headers["X-Opencode-Api-Key"] = opencodeApiKey;

				const response = await fetch("/api/channel-suggestions", {
					method: "POST",
					headers: { ...headers, "Content-Type": "application/json" },
					body: JSON.stringify({
						subscriptions: subscriptions.map((s) => ({
							id: s.id,
							title: s.title,
							handle: s.customUrl?.replace(/^@/, "") || "",
						})),
					}),
				});

				if (!response.ok) {
					const body = await response.json().catch(() => ({}));
					const message =
						(body as { error?: string }).error || "Failed to get suggestions";
					setState({ phase: "error", message });
					return;
				}

				const data = (await response.json()) as {
					results: YouTubeChannel[];
				};
				const results = Array.isArray(data.results) ? data.results : [];
				setState({ phase: "results", channels: results });
			} catch {
				setState({
					phase: "error",
					message: "Network error — check your connection and try again.",
				});
			}
		},
		[],
	);

	const reset = useCallback(() => {
		setState({ phase: "idle" });
	}, []);

	return { state, fetchSuggestions, reset };
}
