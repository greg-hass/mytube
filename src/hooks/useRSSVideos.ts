import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { YouTubeVideo } from "../types/youtube";

export interface SyncStatus {
	total: number;
	current: number;
	isSyncing: boolean;
	lastUpdated: number;
	errors: number;
	videos: number;
	state: "idle" | "running" | "queued" | "error";
	refreshId?: string | null;
	failedChannels: FailedChannelRefresh[];
	scheduledRefresh?: ScheduledRefreshStatus;
}

export interface FailedChannelRefresh {
	id: string;
	title: string;
	reason: string;
	lastSuccessfulFetchAt?: string;
	lastFailedFetchAt?: string;
	consecutiveFailures?: number;
	backoffUntil?: string | null;
}

export interface ScheduledRefreshStatus {
	enabled: boolean;
	intervalMs: number;
	nextRunAt: string | null;
	lastRunAt: string | null;
}

interface AggregationStatus {
	state: "idle" | "running" | "queued" | "error";
	current: number;
	total: number;
	videos: number;
	errors: number;
	startedAt: string | null;
	completedAt: string | null;
	lastUpdated: string | null;
	refreshId?: string | null;
	failedChannels?: FailedChannelRefresh[];
	scheduledRefresh?: ScheduledRefreshStatus;
}

function computeSyncStatus(
	aggregationStatus: AggregationStatus | undefined,
	serverData:
		| { totalChannels?: number; videos?: YouTubeVideo[]; lastUpdated?: string }
		| undefined,
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
		isSyncing: isRefreshPending || state === "running" || state === "queued",
		lastUpdated: lastUpdated ? new Date(lastUpdated).getTime() : 0,
		errors: aggregationStatus?.errors || 0,
		videos: videosCount,
		state,
		refreshId: aggregationStatus?.refreshId || null,
		failedChannels: aggregationStatus?.failedChannels || [],
		scheduledRefresh: aggregationStatus?.scheduledRefresh,
	};
}

function computeCacheStatus(
	serverData: { lastUpdated?: string; videos?: unknown[] } | undefined,
	serverDataUpdatedAt: number,
) {
	const CACHE_TTL = 60 * 60 * 1000; // 1 hour
	const lastUpdated = serverData?.lastUpdated
		? new Date(serverData.lastUpdated).getTime()
		: 0;
	const age = Math.max(0, serverDataUpdatedAt - lastUpdated);

	return {
		hasCache: !!serverData?.videos?.length,
		isStale: age > CACHE_TTL,
		age,
		videoCount: serverData?.videos?.length || 0,
	};
}

function aggregationRefetchInterval(query: {
	state: { data?: AggregationStatus };
}) {
	if (
		typeof document !== "undefined" &&
		document.visibilityState === "hidden"
	) {
		return false;
	}
	const state = query.state.data?.state;
	if (state === "running" || state === "queued") return 2000;
	return 15000;
}

/**
 * Hook for fetching videos from the server-side aggregator
 * Provides automatic caching and refresh
 */
export const useRSSVideos = () => {
	const queryClient = useQueryClient();
	const [trackedRefreshId, setTrackedRefreshId] = useState<string | null>(null);
	const completedRefreshIdRef = useRef<string | null>(null);

	const { data: aggregationStatus } = useQuery<AggregationStatus>({
		queryKey: ["server-videos-status"],
		queryFn: async () => {
			const response = await fetch(`/api/videos/status?t=${Date.now()}`);
			if (!response.ok) {
				throw new Error("Failed to fetch video refresh status");
			}
			return response.json();
		},
		staleTime: 0,
		refetchInterval: aggregationRefetchInterval,
	});

	const isAggregating =
		aggregationStatus?.state === "running" ||
		aggregationStatus?.state === "queued";

	// Cache last ETag and response for 304 handling
	const videosETagRef = useRef<string | null>(null);
	const videosDataRef = useRef<Record<string, unknown> | null>(null);

	// Fetch videos from server
	const {
		data: serverData,
		dataUpdatedAt: serverDataUpdatedAt,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["server-videos"],
		queryFn: async () => {
			const headers: Record<string, string> = {};
			if (videosETagRef.current) {
				headers["If-None-Match"] = videosETagRef.current;
			}
			const response = await fetch("/api/videos", { headers });
			if (response.status === 304 && videosDataRef.current) {
				return videosDataRef.current;
			}
			if (!response.ok) {
				throw new Error("Failed to fetch videos from server");
			}
			const etag = response.headers.get("etag");
			if (etag) {
				videosETagRef.current = etag;
			}
			const data = await response.json();
			videosDataRef.current = data;
			return data;
		},
		placeholderData: (previousData) => previousData,
		staleTime: 1000 * 60, // 1 minute
		refetchInterval: () => {
			if (
				typeof document !== "undefined" &&
				document.visibilityState === "hidden"
			) {
				return false;
			}
			return isAggregating ? 5000 : 1000 * 30;
		},
	});

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

	// Trigger server-side refresh
	const triggerServerRefresh = useMutation({
		mutationFn: async () => {
			const response = await fetch("/api/videos/refresh", {
				method: "POST",
			});
			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				throw new Error(`Server returned ${response.status}: ${errorText}`);
			}
			return response.json();
		},
		onSuccess: (data: { refreshId?: string | null }) => {
			setTrackedRefreshId(data.refreshId || null);
			queryClient.invalidateQueries({ queryKey: ["server-videos-status"] });
			toast.success("Feed refresh started — pulling new videos...");
		},
		onError: (error) => {
			console.error("Pull-to-refresh failed:", error);
			toast.error(
				`Refresh failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		},
	});

	const refreshIsActive = Boolean(
		triggerServerRefresh.isPending ||
		(trackedRefreshId &&
			(!aggregationStatus ||
				aggregationStatus.refreshId !== trackedRefreshId ||
				aggregationStatus.state === "running" ||
				aggregationStatus.state === "queued")),
	);
	const refreshPhase = triggerServerRefresh.isPending
		? "queuing"
		: refreshIsActive
			? "refreshing"
			: trackedRefreshId
				? aggregationStatus?.state === "error"
					? "error"
					: "done"
				: "idle";
	const refreshProgress =
		refreshPhase === "idle"
			? 0
			: refreshPhase === "queuing"
				? 5
				: refreshPhase === "done" || refreshPhase === "error"
					? 100
					: aggregationStatus?.refreshId === trackedRefreshId &&
						  aggregationStatus.total
						? Math.min(
								Math.round(
									((aggregationStatus.current || 0) /
										aggregationStatus.total) *
										100,
								),
								100,
							)
						: 5;

	useEffect(() => {
		if (!trackedRefreshId || !aggregationStatus) return;
		if (aggregationStatus.refreshId !== trackedRefreshId) return;
		if (
			aggregationStatus.state !== "idle" &&
			aggregationStatus.state !== "error"
		) {
			return;
		}

		if (completedRefreshIdRef.current !== trackedRefreshId) {
			completedRefreshIdRef.current = trackedRefreshId;
			if (aggregationStatus.state === "error") {
				toast.error("Feed refresh finished with errors");
			} else {
				toast.success("Feed refresh complete");
			}
		}

		const timeout = window.setTimeout(() => {
			setTrackedRefreshId(null);
		}, 1500);
		return () => window.clearTimeout(timeout);
	}, [aggregationStatus, trackedRefreshId]);

	const videos = useMemo<YouTubeVideo[]>(() => {
		if (!serverData?.videos) return [];
		return serverData.videos;
	}, [serverData]);

	const syncStatus = useMemo<SyncStatus>(
		() =>
			computeSyncStatus(
				aggregationStatus,
				serverData,
				triggerServerRefresh.isPending,
			),
		[aggregationStatus, serverData, triggerServerRefresh.isPending],
	);

	const cacheStatus = useMemo(
		() => computeCacheStatus(serverData, serverDataUpdatedAt),
		[serverData, serverDataUpdatedAt],
	);

	return {
		// Data
		videos,
		cachedVideos: videos,

		// Loading states
		isLoading,
		isFetching: triggerServerRefresh.isPending,
		isRefreshing: refreshIsActive,
		refreshPhase,
		refreshProgress,
		isCacheLoading: isLoading,
		syncStatus,

		// Error states
		error,
		fetchError: error,
		cacheError: error,

		// Cache status
		cacheStatus,
		isCacheStale: cacheStatus.isStale,

		// Actions
		refresh: () => triggerServerRefresh.mutate(),
		clearCache: async () => {
			queryClient.invalidateQueries({ queryKey: ["server-videos"] });
		},
		cleanupOldCache: async () => {
			// No-op for server-side
		},

		// Mutation states
		isClearing: false,
		isCleaning: false,
	};
};
