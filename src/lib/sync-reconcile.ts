import {
	applyServerRedirects,
	applyServerSettings,
	fetchServerSyncData,
	mergeSubscriptionLists,
	pushToServer,
	subscriptionsChanged,
	watchedVideosChanged,
	type RevisionRecorder,
	type ServerSyncData,
	type SyncSettingsHandler,
} from "./server-sync";
import {
	applySubscriptionTombstones,
	resolveWatchedVideoSync,
	subscriptionsEqual,
} from "./subscription-sync";
import {
	addSubscriptions,
	clearAllSubscriptions,
	getAllSubscriptions,
	type StoredSubscription,
} from "./indexeddb";
import { toast } from "sonner";

export type SyncCallbacks = {
	recordRevision: RevisionRecorder;
	getLastRevision: () => number | null;
	invalidateQueries: () => void;
	onInitialSyncComplete?: () => void;
	getStoreState: () => {
		searchQuery: string;
		sortBy: string;
		quotaUsed: number;
		watchedVideos: Set<string>;
	};
	setWatchedVideos: (videos: string[]) => void;
	setQuota: (quota: number) => void;
	setApiExhausted: (exhausted: boolean) => void;
};

export type SyncOptions = {
	importRemoteWatched?: boolean;
	forcePush?: boolean;
};

type Tombstone = { id: string; revision: number };

// ---------------------------------------------------------------------------
// Helpers — each isolated to keep runReconciliation under complexity/fan-out
// ---------------------------------------------------------------------------

function createSettingsHandler(callbacks: SyncCallbacks): SyncSettingsHandler {
	return {
		onQuotaExceeded: () =>
			toast.error(
				"API Quota Exceeded! Video updates paused until midnight PT.",
			),
		onQuotaWarning: (pct) => toast.warning(`API Quota at ${pct}%`),
		setQuota: callbacks.setQuota,
		setApiExhausted: callbacks.setApiExhausted,
		getCurrentQuota: () => callbacks.getStoreState().quotaUsed,
	};
}

function parseRemoteData(remoteData: ServerSyncData) {
	const tombstones: Tombstone[] = Array.isArray(
		remoteData.subscriptionTombstones,
	)
		? remoteData.subscriptionTombstones
		: [];
	const remoteSubs = applySubscriptionTombstones(
		remoteData.subscriptions || [],
		tombstones,
	);
	const remoteWatched = remoteData.watchedVideos || [];
	const redirects = remoteData.redirects || {};
	return { tombstones, remoteSubs, remoteWatched, redirects };
}

async function applyRedirectsAndPersist(
	localSubs: StoredSubscription[],
	tombstones: Tombstone[],
	redirects: Record<string, string>,
	callbacks: SyncCallbacks,
): Promise<StoredSubscription[]> {
	const { subs, tombstonesApplied, redirectsApplied } = applyServerRedirects(
		localSubs,
		tombstones,
		redirects,
	);
	if (tombstonesApplied || redirectsApplied) {
		await clearAllSubscriptions();
		await addSubscriptions(subs);
		callbacks.invalidateQueries();
	}
	return subs;
}

async function mergeAndUpdateLocal(
	localSubs: StoredSubscription[],
	remoteSubs: StoredSubscription[],
	localWatched: string[],
	remoteWatched: string[],
	opts: SyncOptions,
	callbacks: SyncCallbacks,
): Promise<{
	mergedSubs: StoredSubscription[];
	mergedWatched: string[];
	updatedLocal: boolean;
}> {
	const mergedSubs = mergeSubscriptionLists(localSubs, remoteSubs);
	const mergedWatched = resolveWatchedVideoSync(localWatched, remoteWatched, {
		importRemote: opts.importRemoteWatched ?? false,
	});

	let updatedLocal = false;

	if (subscriptionsChanged(localSubs, mergedSubs)) {
		await clearAllSubscriptions();
		await addSubscriptions(mergedSubs);
		callbacks.invalidateQueries();
		updatedLocal = true;
	}

	if (
		opts.importRemoteWatched &&
		watchedVideosChanged(mergedWatched, localWatched)
	) {
		callbacks.setWatchedVideos(mergedWatched);
		updatedLocal = true;
	}

	return { mergedSubs, mergedWatched, updatedLocal };
}

async function pushIfChanged(
	mergedSubs: StoredSubscription[],
	remoteSubs: StoredSubscription[],
	mergedWatched: string[],
	remoteWatched: string[],
	callbacks: SyncCallbacks,
): Promise<void> {
	if (
		mergedSubs.length !== remoteSubs.length ||
		watchedVideosChanged(mergedWatched, remoteWatched)
	) {
		const { searchQuery, sortBy, quotaUsed } = callbacks.getStoreState();
		const pushResult = await pushToServer(
			{
				subscriptions: mergedSubs,
				settings: { searchQuery, sortBy, quotaUsed },
				watchedVideos: mergedWatched,
			},
			callbacks.getLastRevision(),
			callbacks.recordRevision,
		);
		if (pushResult.status === 412) {
			console.warn(
				"⏭️  Skipping push; server has newer revision. Will reconcile on next sync.",
			);
		} else if (pushResult.ok) {
			console.log("✅ Data pushed to server");
		}
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch server data, merge with local, and persist changes.
 * Used as the React Query queryFn for subscription fetching.
 */
export async function fetchAndMergeSubscriptions(
	recordRevision: RevisionRecorder,
): Promise<StoredSubscription[]> {
	const localSubs = await getAllSubscriptions();

	const response = await fetch(`/api/sync?t=${Date.now()}`);
	if (!response.ok) return localSubs;

	const remoteData = await response.json();
	recordRevision(remoteData);
	const tombstones = Array.isArray(remoteData.subscriptionTombstones)
		? remoteData.subscriptionTombstones
		: [];
	const remoteSubs = applySubscriptionTombstones(
		remoteData.subscriptions || [],
		tombstones,
	);
	const mergedSubs = mergeSubscriptionLists(localSubs, remoteSubs);

	if (!subscriptionsEqual(localSubs, mergedSubs)) {
		await addSubscriptions(mergedSubs);
	}

	return mergedSubs;
}

/**
 * Force-push local state to the server (retry once on 412).
 */
export async function forcePushLocalState(
	callbacks: SyncCallbacks,
): Promise<void> {
	const localSubs = await getAllSubscriptions();
	const { searchQuery, sortBy, quotaUsed } = callbacks.getStoreState();

	const payload = {
		subscriptions: localSubs,
		settings: { searchQuery, sortBy, quotaUsed },
		watchedVideos: Array.from(callbacks.getStoreState().watchedVideos),
	};

	const { forcePushToServer } = await import("./server-sync");
	await forcePushToServer(
		payload,
		callbacks.getLastRevision(),
		callbacks.recordRevision,
	);
}

/**
 * Full server reconciliation: fetch, merge, apply settings, push if needed.
 */
export async function runReconciliation(
	opts: SyncOptions,
	callbacks: SyncCallbacks,
): Promise<void> {
	const remoteData = await fetchServerSyncData();
	callbacks.recordRevision(remoteData);
	const { tombstones, remoteSubs, remoteWatched, redirects } =
		parseRemoteData(remoteData);

	const storedLocalSubs = await getAllSubscriptions();
	const localSubs = await applyRedirectsAndPersist(
		storedLocalSubs,
		tombstones,
		redirects,
		callbacks,
	);

	const localWatched = Array.from(callbacks.getStoreState().watchedVideos);
	const { mergedSubs, mergedWatched, updatedLocal } = await mergeAndUpdateLocal(
		localSubs,
		remoteSubs,
		localWatched,
		remoteWatched,
		opts,
		callbacks,
	);

	applyServerSettings(remoteData.settings, createSettingsHandler(callbacks));

	if (updatedLocal) {
		toast.dismiss();
		toast.success("Synced with server!");
	}

	await pushIfChanged(
		mergedSubs,
		remoteSubs,
		mergedWatched,
		remoteWatched,
		callbacks,
	);

	if (opts.importRemoteWatched) {
		callbacks.onInitialSyncComplete?.();
	}
}
