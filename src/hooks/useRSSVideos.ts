/* ast-grep-ignore: find-import-file-without-extension (package imports use bare specifiers, not relative paths) */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { YouTubeVideo } from "../types/youtube.js";

export interface SyncStatus {
	total: number;
	current: number;
	isSyncing: boolean;
	lastUpdated: number;
	errors: number;
	videos: number;
	state: "idle" | "running" | "error";
	failedChannels: FailedChannelRefresh[];
	scheduledRefresh?: ScheduledRefreshStatus;
}

export interface FailedChannelRefresh {
	id: string;
	title: string;
	reason: string;
	lastSuccessfulFetchAt?: string;
}

export interface ScheduledRefreshStatus {
	enabled: boolean;
	intervalMs: number;
	nextRunAt: string | null;
	lastRunAt: string | null;
}

interface AggregationStatus {
	state: "idle" | "running" | "error";
	current: number;
	total: number;
	videos: number;
	errors: number;
	startedAt: string | null;
	completedAt: string | null;
	lastUpdated: string | null;
	failedChannels?: FailedChannelRefresh[];
	scheduledRefresh?: ScheduledRefreshStatus;
}

interface ServerData {
	totalChannels?: number;
	videos?: YouTubeVideo[];
	lastUpdated?: string;
}

// ── Pure helpers ──────────────────────────────────────────────

function computeSyncStatus(
	aggregationStatus: AggregationStatus | undefined,
	serverData: ServerData | undefined,
	isRefreshPending: boolean,
): SyncStatus {
	const state = aggregationStatus?.state || "idle";
	const current = aggregationStatus?.current ?? serverData?.totalChannels ?? 0;
	const total = aggregationStatus?.total ?? serverData?.totalChannels ?? 0;
	const videosCount =
		aggregationStatus?.videos ?? serverData?.videos?.length ?? 0;
	const lastUpdated = aggregationStatus?.lastUpdated || serverData?.lastUpdated;

	return {
		total,
		current,
		isSyncing: isRefreshPending || state === "running",
		lastUpdated: lastUpdated ? new Date(lastUpdated).getTime() : 0,
		errors: aggregationStatus?.errors || 0,
		videos: videosCount,
		state,
		failedChannels: aggregationStatus?.failedChannels || [],
		scheduledRefresh: aggregationStatus?.scheduledRefresh,
	};
}

function computeCacheStatus(
	serverData: ServerData | undefined,
	serverDataUpdatedAt: number,
) {
	const CACHE_TTL = 60 * 60 * 1000; // 1 hour
	const lastUpdated = serverData?.lastUpdated
		? new Date(serverData.lastUpdated).getTime()
		: 0;
	const age = Math.max(0, serverDataUpdatedAt - lastUpdated);

	return {
		hasCache: Boolean(serverData?.videos?.length),
		isStale: age > CACHE_TTL,
		age,
		videoCount: serverData?.videos?.length || 0,
	};
}

function statusRefetchInterval(query: {
	state: { data?: AggregationStatus };
}): number | false {
	if (
		typeof document !== "undefined" &&
		document.visibilityState === "hidden"
	) {
		return false;
	}
	return query.state.data?.state === "running" ? 1500 : 5000;
}

// ── Sub-hooks ─────────────────────────────────────────────────

function useAggregationStatus(refreshTriggered: boolean) {
	return useQuery<AggregationStatus>({
		queryKey: ["server-videos-status"],
		queryFn: async () => {
			const response = await fetch(`/api/videos/status?t=${Date.now()}`, {
				cache: "no-store",
				credentials: "same-origin",
			});
			if (!response.ok) {
				throw new Error("Failed to fetch video refresh status");
			}
			return response.json();
		},
		staleTime: 0,
		refetchInterval: refreshTriggered ? 1500 : statusRefetchInterval,
	});
}

function useServerVideos(isAggregating: boolean) {
	return useQuery({
		queryKey: ["server-videos"],
		queryFn: async () => {
			const response = await fetch("/api/videos", {
				cache: "no-store",
				credentials: "same-origin",
			});
			if (!response.ok) {
				throw new Error("Failed to fetch videos from server");
			}
			return response.json();
		},
		placeholderData: (previousData: ServerData | undefined) => previousData,
		staleTime: 1000 * 60, // 1 minute
		refetchInterval: () => {
			if (
				typeof document !== "undefined" &&
				document.visibilityState === "hidden"
			) {
				return false;
			}
			return isAggregating ? 3000 : 1000 * 10;
		},
	});
}

function useRefreshMutation(queryClient: ReturnType<typeof useQueryClient>) {
	const [refreshTriggered, setRefreshTriggered] = useState(false);

	const mutation = useMutation({
		mutationFn: async () => {
			const response = await fetch("/api/videos/refresh", {
				method: "POST",
				cache: "no-store",
				credentials: "same-origin",
			});
			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				throw new Error(`Server returned ${response.status}: ${errorText}`);
			}
			return response.json();
		},
		onSuccess: async () => {
			setRefreshTriggered(true);
			await Promise.all([
				queryClient.refetchQueries({
					queryKey: ["server-videos-status"],
					type: "active",
				}),
				queryClient.refetchQueries({
					queryKey: ["server-videos"],
					type: "active",
				}),
			]);
			toast.success("Feed refresh started — pulling new videos...");
		},
		onError: (error: unknown) => {
			toast.error(
				`Refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		},
	});

	return { mutation, refreshTriggered, setRefreshTriggered };
}

function useRefreshLifecycle(
	refreshTriggered: boolean,
	setRefreshTriggered: (v: boolean) => void,
	aggregationStatus: AggregationStatus | undefined,
	queryClient: ReturnType<typeof useQueryClient>,
) {
	useEffect(() => {
		if (!refreshTriggered || !aggregationStatus) return;

		if (aggregationStatus.state === "running") {
			void queryClient.refetchQueries({
				queryKey: ["server-videos"],
				type: "active",
			});
			return;
		}

		if (aggregationStatus.state === "error") {
			toast.error("Feed refresh finished with errors");
		} else {
			toast.success("Feed refresh complete");
		}

		const timeout = window.setTimeout(() => {
			setRefreshTriggered(false);
		}, 1500);
		return () => window.clearTimeout(timeout);
	}, [aggregationStatus, queryClient, refreshTriggered, setRefreshTriggered]);
}

// ── Refresh phase helpers ─────────────────────────────────────

type RefreshPhase = "idle" | "queuing" | "refreshing" | "done" | "error";

function getRefreshPhase(
	isPending: boolean,
	isRefreshing: boolean,
	refreshTriggered: boolean,
	state: string | undefined,
): RefreshPhase {
	if (isPending) return "queuing";
	if (isRefreshing) return "refreshing";
	if (!refreshTriggered) return "idle";
	return state === "error" ? "error" : "done";
}

function getRefreshProgress(
	phase: RefreshPhase,
	aggregationStatus: AggregationStatus | undefined,
): number {
	switch (phase) {
		case "queuing":
			return 5;
		case "done":
		case "error":
			return 100;
		case "idle":
			return 0;
		case "refreshing":
			if (aggregationStatus?.total) {
				return Math.min(
					Math.round(
						((aggregationStatus.current || 0) / aggregationStatus.total) * 100,
					),
					100,
				);
			}
			return 5;
		default:
			return 0;
	}
}

// ── Main hook ─────────────────────────────────────────────────

/**
 * Hook for fetching videos from the server-side aggregator.
 * Provides automatic caching and refresh.
 */
export const useRSSVideos = () => {
	const queryClient = useQueryClient();

	const { mutation, refreshTriggered, setRefreshTriggered } =
		useRefreshMutation(queryClient);

	const { data: aggregationStatus } = useAggregationStatus(refreshTriggered);

	const isAggregating = aggregationStatus?.state === "running";

	const {
		data: serverData,
		dataUpdatedAt: serverDataUpdatedAt,
		isLoading,
		error,
	} = useServerVideos(isAggregating);

	// Invalidate video cache when status indicates newer data
	useEffect(() => {
		if (!aggregationStatus?.lastUpdated || !serverData?.lastUpdated) return;

		const statusUpdatedAt = new Date(aggregationStatus.lastUpdated).getTime();
		const videosUpdatedAt = new Date(serverData.lastUpdated).getTime();

		if (
			Number.isFinite(statusUpdatedAt) &&
			Number.isFinite(videosUpdatedAt) &&
			statusUpdatedAt > videosUpdatedAt
		) {
			queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		}
	}, [aggregationStatus?.lastUpdated, queryClient, serverData?.lastUpdated]);

	useRefreshLifecycle(
		refreshTriggered,
		setRefreshTriggered,
		aggregationStatus,
		queryClient,
	);

	const isRefreshing =
		mutation.isPending || aggregationStatus?.state === "running";

	const refreshPhase = getRefreshPhase(
		mutation.isPending,
		isRefreshing,
		refreshTriggered,
		aggregationStatus?.state,
	);
	const refreshProgress = getRefreshProgress(refreshPhase, aggregationStatus);

	const videos = useMemo<YouTubeVideo[]>(() => {
		if (!serverData?.videos) return [];
		return serverData.videos;
	}, [serverData]);

	const syncStatus = useMemo<SyncStatus>(
		() => computeSyncStatus(aggregationStatus, serverData, mutation.isPending),
		[aggregationStatus, serverData, mutation.isPending],
	);

	const cacheStatus = useMemo(
		() => computeCacheStatus(serverData, serverDataUpdatedAt),
		[serverData, serverDataUpdatedAt],
	);

	return {
		videos,
		cachedVideos: videos,
		isLoading,
		isFetching: mutation.isPending,
		isRefreshing,
		refreshPhase,
		refreshProgress,
		isCacheLoading: isLoading,
		syncStatus,
		error,
		fetchError: error,
		cacheError: error,
		cacheStatus,
		isCacheStale: cacheStatus.isStale,
		refresh: () => mutation.mutate(),
		clearCache: async () => {
			queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		},
		cleanupOldCache: async () => {
			// No-op for server-side
		},
		isClearing: false,
		isCleaning: false,
	};
};
