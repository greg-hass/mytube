import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { YouTubeVideo } from "../types/youtube";

export interface LiveLookupFailure {
	id: string;
	title: string;
	reason: string;
}

export interface LiveVideosResponse {
	videos: YouTubeVideo[];
	checkedAt: string;
	totalChannels: number;
	checkedChannels: number;
	invalidChannels: number;
	failedChannels: LiveLookupFailure[];
}

const EMPTY_RESPONSE: LiveVideosResponse = {
	videos: [],
	checkedAt: "",
	totalChannels: 0,
	checkedChannels: 0,
	invalidChannels: 0,
	failedChannels: [],
};

async function fetchLiveVideos(force = false): Promise<LiveVideosResponse> {
	const response = await fetch(`/api/videos/live${force ? "?refresh=1" : ""}`, {
		cache: "no-store",
		credentials: "same-origin",
	});
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(body?.error || `Live lookup failed with HTTP ${response.status}`);
	}
	return response.json();
}

export function useLiveVideos(enabled: boolean) {
	const queryClient = useQueryClient();
	const query = useQuery<LiveVideosResponse>({
		queryKey: ["live-videos"],
		queryFn: () => fetchLiveVideos(false),
		enabled,
		staleTime: 30 * 1000,
		refetchInterval: () => {
			if (!enabled) return false;
			if (
				typeof document !== "undefined" &&
				document.visibilityState === "hidden"
			) {
				return false;
			}
			return 60 * 1000;
		},
	});

	return {
		...query,
		data: query.data || EMPTY_RESPONSE,
		refresh: () => query.refetch({ cancelRefetch: false }),
		forceRefresh: () =>
			queryClient.fetchQuery({
				queryKey: ["live-videos"],
				queryFn: () => fetchLiveVideos(true),
				staleTime: 0,
			}),
	};
}
