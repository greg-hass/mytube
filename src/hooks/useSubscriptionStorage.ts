import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import {
	getSubscriptionCount,
	type StoredSubscription,
} from "../lib/indexeddb";
import { isAuthError } from "../lib/api-auth";
import {
	downloadJSON,
	downloadOPML,
	filterAndSortChannels,
	parseJSONImport,
	toYouTubeChannels,
} from "../lib/subscriptions-io";
import { refreshAllChannels } from "../lib/channel-refresh";
import {
	hydrateThumbnails,
	repairChannelIcons as runIconRepair,
} from "../lib/icon-repair";
import {
	fetchAndMergeSubscriptions,
	forcePushLocalState,
	runReconciliation,
	type SyncCallbacks,
	type SyncOptions,
} from "../lib/sync-reconcile";
import type { RevisionRecorder } from "../lib/server-sync";
import {
	handleClearCacheUpdate,
	handleRemovalCacheUpdate,
	setSubscriptionGroupHandler,
	toggleFavoriteHandler,
	toggleMuteHandler,
} from "../lib/subscription-cache";
import { hasPlaceholderThumbnail } from "../lib/subscription-sync";
import { parseSubscriptionImportToSubscriptions } from "../lib/opml-parser";
import { useStore } from "../store/useStore";

const SUBSCRIPTIONS_QUERY_KEY = ["subscriptions"] as const;
const SUBSCRIPTIONS_COUNT_QUERY_KEY = ["subscriptions-count"] as const;
const RSS_VIDEOS_KEY = ["rss-videos"] as const;
const SERVER_VIDEOS_KEY = ["server-videos"] as const;
const SERVER_VIDEOS_STATUS_KEY = ["server-videos-status"] as const;

// ---------------------------------------------------------------------------
// Lightweight hooks — no side-effect subscriptions, safe to mount anywhere
// ---------------------------------------------------------------------------

/**
 * Subscription count only — no sync effects, no icon repair, no auto-save.
 * Safe for components that just need the channel count display.
 */
export function useSubscriptionCount(): number {
	const { data: count = 0 } = useQuery({
		queryKey: SUBSCRIPTIONS_COUNT_QUERY_KEY,
		queryFn: getSubscriptionCount,
		staleTime: 1000 * 60 * 5,
	});
	return count;
}

/**
 * Export handlers for OPML/JSON — reads from the React Query cache.
 * No sync effects. Safe for Header which only needs export on button click.
 */
export function useExportHandlers() {
	const queryClient = useQueryClient();

	const exportOPML = useCallback(() => {
		const subs =
			queryClient.getQueryData<StoredSubscription[]>(SUBSCRIPTIONS_QUERY_KEY) ||
			[];
		downloadOPML(subs);
	}, [queryClient]);

	const exportJSON = useCallback(() => {
		const subs =
			queryClient.getQueryData<StoredSubscription[]>(SUBSCRIPTIONS_QUERY_KEY) ||
			[];
		downloadJSON(subs, Array.from(useStore.getState().watchedVideos));
	}, [queryClient]);

	return { exportOPML, exportJSON };
}

async function deleteSubscriptionOnServer(channelId: string): Promise<void> {
	const response = await fetch(
		`/api/subscriptions/${encodeURIComponent(channelId)}`,
		{
			method: "DELETE",
		},
	);
	if (response.ok || response.status === 404) return;
	throw new Error(
		`Failed to delete subscription on server (${response.status})`,
	);
}

// ---------------------------------------------------------------------------
// Module-level helpers (keep hook body free of control flow)
// ---------------------------------------------------------------------------

type CacheHandlers = {
	toggleFavorite: (channelId: string) => Promise<void>;
	toggleMute: (channelId: string) => Promise<void>;
	setSubscriptionGroup: (channelId: string, group: string) => Promise<void>;
};

function createCacheHandlers(queryClient: QueryClient): CacheHandlers {
	return {
		toggleFavorite: (id) => toggleFavoriteHandler(queryClient, id),
		toggleMute: (id) => toggleMuteHandler(queryClient, id),
		setSubscriptionGroup: (id, group) =>
			setSubscriptionGroupHandler(queryClient, id, group),
	};
}

function markWatchedFromList(videoIds: string[]) {
	for (const videoId of videoIds) {
		useStore.getState().markAsWatched(videoId);
	}
}

// ---------------------------------------------------------------------------
// Sub-hooks (each has its own function scope — isolated complexity/fan-out)
// ---------------------------------------------------------------------------

/**
 * Manages sync concurrency guard and delegates to reconciliation functions.
 * Builds the SyncCallbacks object internally so those calls don't count
 * towards the parent hook's fan-out.
 */
function useSyncRunner(
	recordRevision: RevisionRecorder,
	invalidateQueries: () => void,
	revisionRef: RefObject<number | null>,
	initialSyncRef: RefObject<boolean>,
) {
	const syncInProgressRef = useRef(false);
	const pendingForcePushRef = useRef(false);

	const callbacks = useMemo<SyncCallbacks>(
		() => ({
			recordRevision,
			getLastRevision: () => revisionRef.current,
			invalidateQueries,
			onInitialSyncComplete: () => {
				initialSyncRef.current = true;
			},
			getStoreState: () => useStore.getState(),
			setWatchedVideos: (videos) =>
				useStore.getState().setWatchedVideos(videos),
			setQuota: (q) => useStore.getState().setQuota(q),
			setApiExhausted: (e) => useStore.getState().setApiExhausted(e),
		}),
		// revisionRef and initialSyncRef are stable RefObjects — included for lint
		[recordRevision, invalidateQueries, revisionRef, initialSyncRef],
	);

	return useCallback(
		async (opts?: SyncOptions) => {
			const o: SyncOptions = opts ?? {};

			if (syncInProgressRef.current) {
				if (o.forcePush) pendingForcePushRef.current = true;
				return;
			}

			syncInProgressRef.current = true;
			try {
				if (o.forcePush) {
					await forcePushLocalState(callbacks);
				} else {
					await runReconciliation(o, callbacks);
				}
			} finally {
				syncInProgressRef.current = false;
				while (pendingForcePushRef.current) {
					pendingForcePushRef.current = false;
					syncInProgressRef.current = true;
					try {
						await forcePushLocalState(callbacks);
					} finally {
						syncInProgressRef.current = false;
					}
				}
			}
		},
		[callbacks],
	);
}

type MutationDeps = {
	queryClient: QueryClient;
	syncWithBackend: (opts?: SyncOptions) => Promise<void>;
	invalidateQueries: () => void;
};

/**
 * All subscription mutations (import, add, remove, clear).
 */
function useSubscriptionMutations(deps: MutationDeps) {
	const { queryClient, syncWithBackend, invalidateQueries } = deps;

	const importOPML = useMutation({
		mutationFn: async (importContent: string) => {
			const newSubscriptions =
				parseSubscriptionImportToSubscriptions(importContent);
			const { addSubscriptions } = await import("../lib/indexeddb");
			await addSubscriptions(newSubscriptions);
			return newSubscriptions;
		},
		onSuccess: async () => {
			// Push imported subscriptions to the server so the server-side
			// aggregator can fetch videos. forcePush because the OPML/CSV is
			// the authoritative source — local IndexedDB must win over any
			// stale server snapshot. Mirrors clearAllMutation.
			await syncWithBackend({ forcePush: true });
			invalidateQueries();
			queryClient.invalidateQueries({ queryKey: RSS_VIDEOS_KEY });
			queryClient.invalidateQueries({ queryKey: SERVER_VIDEOS_KEY });
			queryClient.invalidateQueries({ queryKey: SERVER_VIDEOS_STATUS_KEY });
		},
	});

	const addSubscriptionsMutation = useMutation({
		mutationFn: async (newSubscriptions: StoredSubscription[]) => {
			const { addSubscriptions } = await import("../lib/indexeddb");
			await addSubscriptions(newSubscriptions);
			return newSubscriptions;
		},
		onSuccess: () => {
			invalidateQueries();
		},
	});

	const removeSubscriptionMutation = useMutation({
		mutationFn: async (channelId: string) => {
			await deleteSubscriptionOnServer(channelId);
			const { removeSubscription } = await import("../lib/indexeddb");
			await removeSubscription(channelId);
			return channelId;
		},
		onSuccess: async (removedChannelId: string) => {
			handleRemovalCacheUpdate(queryClient, removedChannelId);
			queryClient.invalidateQueries({ queryKey: RSS_VIDEOS_KEY });
			await syncWithBackend();
		},
	});

	const clearAllMutation = useMutation({
		mutationFn: async () => {
			const { clearAllSubscriptions } = await import("../lib/indexeddb");
			await clearAllSubscriptions();
		},
		onSuccess: async () => {
			await syncWithBackend({ forcePush: true });
			handleClearCacheUpdate(queryClient);
			queryClient.invalidateQueries({ queryKey: RSS_VIDEOS_KEY });
		},
	});

	return {
		importOPML,
		addSubscriptionsMutation,
		removeSubscriptionMutation,
		clearAllMutation,
	};
}

type IODeps = {
	subscriptions: StoredSubscription[] | undefined;
	apiKey: string;
	queryClient: QueryClient;
};

/**
 * Export/import/refresh handlers for subscription data.
 */
function useSubscriptionIO(deps: IODeps) {
	const { subscriptions, apiKey, queryClient } = deps;

	const exportOPML = useCallback(
		() => downloadOPML(subscriptions || []),
		[subscriptions],
	);

	const exportJSON = useCallback(() => {
		downloadJSON(
			subscriptions || [],
			Array.from(useStore.getState().watchedVideos),
		);
	}, [subscriptions]);

	const importJSON = useCallback(async (jsonContent: string) => {
		try {
			const parsed = parseJSONImport(jsonContent);
			const { addSubscriptions } = await import("../lib/indexeddb");
			await addSubscriptions(parsed.subscriptions);
			if (parsed.apiKey) {
				useStore.getState().setApiKey(parsed.apiKey);
			}
			markWatchedFromList(parsed.watchedVideoIds);
			return parsed.subscriptions.length;
		} catch (error) {
			throw new Error(
				`Failed to import JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}, []);

	const refreshChannels = useCallback(async () => {
		await refreshAllChannels(subscriptions, apiKey, queryClient);
	}, [subscriptions, apiKey, queryClient]);

	return { exportOPML, exportJSON, importJSON, refreshChannels };
}

type EffectDeps = {
	subscriptions: StoredSubscription[] | undefined;
	queryClient: QueryClient;
	syncWithBackend: (opts?: SyncOptions) => Promise<void>;
	repairChannelIcons: () => Promise<number>;
	setIsInitialSyncing: (v: boolean) => void;
	setNeedsServerAuth: (v: boolean) => void;
	hasCompletedInitialSyncRef: RefObject<boolean>;
	watchedVideos: Set<string>;
	isLoading: boolean;
	apiKey: string;
};

/**
 * All side-effect subscriptions (thumbnail hydration, sync, auto-repair, auto-save).
 */
function useSubscriptionEffects(deps: EffectDeps) {
	const {
		subscriptions,
		queryClient,
		syncWithBackend,
		repairChannelIcons,
		setIsInitialSyncing,
		setNeedsServerAuth,
		hasCompletedInitialSyncRef,
		watchedVideos,
		isLoading,
		apiKey,
	} = deps;

	useEffect(() => {
		if (!subscriptions || subscriptions.length === 0) return;

		let isCancelled = false;
		void hydrateThumbnails(subscriptions, queryClient, () => isCancelled);
		return () => {
			isCancelled = true;
		};
	}, [subscriptions, queryClient]);

	useEffect(() => {
		let isMounted = true;
		void syncWithBackend({ importRemoteWatched: true })
			.catch((err) => {
				// Surface auth errors so the UI can prompt for a token.
				// Other errors are transient — the next sync will retry.
				if (isMounted && isAuthError(err)) setNeedsServerAuth(true);
			})
			.finally(() => {
				if (isMounted) setIsInitialSyncing(false);
			});
		return () => {
			isMounted = false;
		};
	}, [syncWithBackend, setIsInitialSyncing, setNeedsServerAuth]);

	useEffect(() => {
		if (!subscriptions?.some(hasPlaceholderThumbnail)) return;
		const timer = setTimeout(() => {
			repairChannelIcons().catch((repairErr) => {
				console.error("Icon repair failed:", repairErr);
			});
		}, 500);
		return () => clearTimeout(timer);
	}, [repairChannelIcons, subscriptions]);

	useEffect(() => {
		if (!isLoading && subscriptions) {
			const timer = setTimeout(() => {
				if (!hasCompletedInitialSyncRef.current) return;
				syncWithBackend().catch((err) => {
					if (isAuthError(err)) setNeedsServerAuth(true);
				});
			}, 2000);
			return () => clearTimeout(timer);
		}
	}, [
		apiKey,
		isLoading,
		subscriptions,
		syncWithBackend,
		watchedVideos,
		hasCompletedInitialSyncRef,
		setNeedsServerAuth,
	]);
}

// ---------------------------------------------------------------------------
// Main hook — thin wiring layer
// ---------------------------------------------------------------------------

/**
 * Hook for managing subscriptions in IndexedDB.
 * Provides CRUD operations and integrates with React Query for caching.
 */
export const useSubscriptionStorage = () => {
	const queryClient = useQueryClient();
	const { searchQuery, sortBy, apiKey, watchedVideos } = useStore();
	const hasCompletedInitialSyncRef = useRef(false);
	const lastKnownServerRevisionRef = useRef<number | null>(null);
	const [isInitialSyncing, setIsInitialSyncing] = useState(true);
	const [needsServerAuth, setNeedsServerAuth] = useState(false);

	const recordServerRevision = useCallback<RevisionRecorder>((snapshot) => {
		if (typeof snapshot?.syncRevision === "number") {
			lastKnownServerRevisionRef.current = snapshot.syncRevision;
		}
	}, []);

	const invalidateSubscriptionQueries = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY });
		queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_COUNT_QUERY_KEY });
	}, [queryClient]);

	const {
		data: subscriptions,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: SUBSCRIPTIONS_QUERY_KEY,
		queryFn: () => fetchAndMergeSubscriptions(recordServerRevision),
		staleTime: 1000 * 60 * 5,
		gcTime: 1000 * 60 * 30,
	});

	const { data: count = 0 } = useQuery({
		queryKey: SUBSCRIPTIONS_COUNT_QUERY_KEY,
		queryFn: getSubscriptionCount,
		staleTime: 1000 * 60 * 5,
	});

	const syncWithBackend = useSyncRunner(
		recordServerRevision,
		invalidateSubscriptionQueries,
		lastKnownServerRevisionRef,
		hasCompletedInitialSyncRef,
	);

	const mutations = useSubscriptionMutations({
		queryClient,
		syncWithBackend,
		invalidateQueries: invalidateSubscriptionQueries,
	});

	const io = useSubscriptionIO({ subscriptions, apiKey, queryClient });

	const repairChannelIcons = useCallback(
		async ({ useApi = false }: { useApi?: boolean } = {}) => {
			return runIconRepair(
				{
					recordRevision: recordServerRevision,
					queryClient,
					invalidateQueries: invalidateSubscriptionQueries,
				},
				{ useApi, apiKey },
			);
		},
		[apiKey, queryClient, recordServerRevision, invalidateSubscriptionQueries],
	);

	const channelSubscriptions = useMemo(
		() => toYouTubeChannels(subscriptions),
		[subscriptions],
	);

	const filteredAndSortedSubscriptions = useMemo(
		() => filterAndSortChannels(channelSubscriptions, searchQuery, sortBy),
		[channelSubscriptions, searchQuery, sortBy],
	);

	const cacheHandlers = useMemo(
		() => createCacheHandlers(queryClient),
		[queryClient],
	);

	useSubscriptionEffects({
		subscriptions,
		queryClient,
		syncWithBackend,
		repairChannelIcons,
		setIsInitialSyncing,
		setNeedsServerAuth,
		hasCompletedInitialSyncRef,
		watchedVideos,
		isLoading,
		apiKey,
	});

	return {
		// Data
		subscriptions: filteredAndSortedSubscriptions,
		allSubscriptions: channelSubscriptions,
		rawSubscriptions: subscriptions || [],
		count,

		// Loading states
		isLoading,
		isInitialSyncing,
		needsServerAuth,
		error,

		// Mutations
		importOPML: mutations.importOPML.mutateAsync,
		addSubscriptions: mutations.addSubscriptionsMutation.mutateAsync,
		removeSubscription: mutations.removeSubscriptionMutation.mutateAsync,
		clearAll: mutations.clearAllMutation.mutateAsync,
		toggleFavorite: cacheHandlers.toggleFavorite,
		toggleMute: cacheHandlers.toggleMute,
		setSubscriptionGroup: cacheHandlers.setSubscriptionGroup,
		exportOPML: io.exportOPML,
		exportJSON: io.exportJSON,
		importJSON: io.importJSON,
		refreshAllChannels: io.refreshChannels,
		repairChannelIcons,
		syncWithBackend,

		// Mutation states
		isImporting: mutations.importOPML.isPending,
		isRemoving: mutations.removeSubscriptionMutation.isPending,
		isClearing: mutations.clearAllMutation.isPending,

		// Refetch
		refetch,
	};
};
