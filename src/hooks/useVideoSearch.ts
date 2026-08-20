/**
 * useVideoSearch — state machine for the Add Channel modal's "Videos"
 * search mode. Finds the latest videos whose titles contain the search
 * words (server scrapes YouTube with the intitle: + upload-date filters),
 * and resolves a video's channel through the existing channel-search
 * endpoint so the standard Add Channel preview flow can take over.
 */
import { useCallback, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type { YouTubeChannel, VideoSearchResult } from "../types/youtube";

type VideoSearchState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "error" }
	| { phase: "results"; videos: VideoSearchResult[] };

function buildSearchHeaders(): HeadersInit {
	const apiKey = useStore.getState().apiKey.trim();
	return apiKey ? { "X-YouTube-Api-Key": apiKey } : {};
}

export function useVideoSearch() {
	const [state, setState] = useState<VideoSearchState>({ phase: "idle" });
	const [resolvingId, setResolvingId] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const search = useCallback(async (query: string) => {
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			setState({ phase: "idle" });
			return;
		}

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		setState({ phase: "loading" });

		try {
			const response = await fetch("/api/video-search", {
				method: "POST",
				headers: { ...buildSearchHeaders(), "Content-Type": "application/json" },
				body: JSON.stringify({ query: trimmed }),
				signal: controller.signal,
			});
			if (controller.signal.aborted) return;
			if (!response.ok) {
				setState({ phase: "error" });
				return;
			}
			const data = (await response.json()) as {
				results?: VideoSearchResult[];
			};
			if (controller.signal.aborted) return;
			const videos = Array.isArray(data.results) ? data.results : [];
			setState({
				phase: "results",
				videos,
			});
		} catch (error) {
			if ((error as Error).name !== "AbortError") {
				console.error("Video search failed:", error);
				setState({ phase: "error" });
			}
		}
	}, []);

	/**
	 * Resolve the channel behind a video result via the existing
	 * channel-search endpoint (raw channel IDs resolve through the server's
	 * direct-scrape path). Returns null when resolution fails.
	 */
	const resolveChannelForVideo = useCallback(
		async (video: VideoSearchResult): Promise<YouTubeChannel | null> => {
			setResolvingId(video.id);
			try {
				const response = await fetch(
					`/api/channel-search?q=${encodeURIComponent(video.channelId)}`,
					{ headers: buildSearchHeaders() },
				);
				if (!response.ok) return null;
				const data = (await response.json()) as {
					results?: YouTubeChannel[];
				};
				const channel = Array.isArray(data.results) ? data.results[0] : undefined;
				return channel ?? null;
			} catch (error) {
				console.error("Channel resolution for video failed:", error);
				return null;
			} finally {
				setResolvingId(null);
			}
		},
		[],
	);

	const reset = useCallback(() => {
		abortRef.current?.abort();
		setState({ phase: "idle" });
		setResolvingId(null);
	}, []);

	return { state, resolvingId, search, resolveChannelForVideo, reset };
}
