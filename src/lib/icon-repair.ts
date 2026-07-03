import type { QueryClient } from "@tanstack/react-query";
import {
	addSubscriptions,
	getAllSubscriptions,
	type StoredSubscription,
} from "./indexeddb";
import { resolveChannelThumbnail } from "./icon-loader";
import {
	applySubscriptionTombstones,
	subscriptionsEqual,
} from "./subscription-sync";
import {
	fetchServerSyncData,
	mergeSubscriptionLists,
	type RevisionRecorder,
} from "./server-sync";
import { fetchChannelIconsBatch } from "./youtube-api";

const SUBSCRIPTIONS_QUERY_KEY = ["subscriptions"] as const;

/**
 * Backfill missing channel thumbnails without API quota.
 * Iterates subs with missing thumbnails and resolves them via icon-loader.
 */
export async function hydrateThumbnails(
	subscriptions: StoredSubscription[],
	queryClient: QueryClient,
	isCancelled: () => boolean,
): Promise<void> {
	const missingThumbnails = subscriptions.filter((sub) => !sub.thumbnail);
	if (missingThumbnails.length === 0) return;

	const updates: StoredSubscription[] = [];

	for (const sub of missingThumbnails) {
		const thumbnail = await resolveChannelThumbnail(sub.id);
		if (isCancelled()) return;
		if (thumbnail) {
			updates.push({ ...sub, thumbnail });
		}
	}

	if (!isCancelled() && updates.length > 0) {
		await addSubscriptions(updates);
		queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY });
	}
}

type RepairDeps = {
	recordRevision: RevisionRecorder;
	queryClient: QueryClient;
	invalidateQueries: () => void;
};

/**
 * Repair channel icons via server sync data (merge local + remote).
 */
async function repairViaServer(deps: RepairDeps): Promise<void> {
	const localSubs = await getAllSubscriptions();

	const remoteData = await fetchServerSyncData();
	deps.recordRevision(remoteData);
	const tombstones = Array.isArray(remoteData.subscriptionTombstones)
		? remoteData.subscriptionTombstones
		: [];
	const remoteSubs = applySubscriptionTombstones(
		remoteData.subscriptions || [],
		tombstones,
	);
	const repairedSubs = mergeSubscriptionLists(localSubs, remoteSubs);

	if (!subscriptionsEqual(localSubs, repairedSubs)) {
		await addSubscriptions(repairedSubs);
		deps.queryClient.setQueryData(SUBSCRIPTIONS_QUERY_KEY, repairedSubs);
		deps.invalidateQueries();
	}
}

/**
 * Repair channel icons via YouTube API batch fetch.
 */
async function repairViaApi(apiKey: string, deps: RepairDeps): Promise<void> {
	const channelIds = Array.from(
		new Set(
			(await getAllSubscriptions())
				.map((sub) => sub.id)
				.filter((id) => id.startsWith("UC")),
		),
	);

	if (channelIds.length === 0) return;

	const apiChannels = await fetchChannelIconsBatch(channelIds, apiKey);
	const apiChannelsById = new Map(
		apiChannels.map((channel) => [channel.id, channel]),
	);

	const currentSubs = await getAllSubscriptions();
	const repairedSubs = currentSubs.map((sub) => {
		const apiChannel = apiChannelsById.get(sub.id);
		if (!apiChannel?.thumbnail) return sub;
		return {
			...sub,
			title: apiChannel.title || sub.title,
			description: apiChannel.description || sub.description,
			thumbnail: apiChannel.thumbnail,
			customUrl: apiChannel.customUrl || sub.customUrl,
		};
	});

	if (!subscriptionsEqual(currentSubs, repairedSubs)) {
		await addSubscriptions(repairedSubs);
		deps.queryClient.setQueryData(SUBSCRIPTIONS_QUERY_KEY, repairedSubs);
		deps.invalidateQueries();
	}
}

/**
 * Full icon repair: try server first, optionally fall back to API.
 */
export async function repairChannelIcons(
	deps: RepairDeps,
	opts: { useApi?: boolean; apiKey?: string } = {},
): Promise<number> {
	const before = new Map(
		(await getAllSubscriptions()).map((subscription) => [
			subscription.id,
			subscription.thumbnail || "",
		]),
	);
	try {
		await repairViaServer(deps);
	} catch (serverErr) {
		if (!opts.useApi) throw serverErr;
		console.warn(
			"Server icon repair unavailable, trying API repair:",
			serverErr,
		);
	}

	if (opts.useApi && opts.apiKey) {
		await repairViaApi(opts.apiKey, deps);
	}

	const after = await getAllSubscriptions();
	return after.filter(
		(subscription) =>
			(before.get(subscription.id) || "") !== (subscription.thumbnail || ""),
	).length;
}
