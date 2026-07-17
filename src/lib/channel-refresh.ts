import type { QueryClient } from "@tanstack/react-query";
import {
	addSubscriptions,
	removeSubscription,
	type StoredSubscription,
} from "./indexeddb";
import { fetchChannelInfo, fetchChannelsBatch } from "./youtube-api";

const SUBSCRIPTIONS_QUERY_KEY = ["subscriptions"] as const;

type RefreshResult = {
	updates: StoredSubscription[];
	removals: string[];
};

/**
 * Batch-fetch metadata for channels with real (UC*) IDs.
 * Returns a list of merged updates preserving original user data.
 */
async function fetchRealChannelUpdates(
	subscriptions: StoredSubscription[],
	realIds: string[],
	apiKey: string,
): Promise<StoredSubscription[]> {
	const updatedChannels = await fetchChannelsBatch(realIds, apiKey);
	const subsById = new Map(subscriptions.map((s) => [s.id, s]));

	const updates: StoredSubscription[] = [];
	for (const channel of updatedChannels) {
		const original = subsById.get(channel.id);
		if (!original) continue;

		updates.push({
			...original,
			thumbnail: channel.thumbnail,
			title: channel.title,
			description: channel.description || original.description,
			customUrl: channel.customUrl || original.customUrl,
		});
	}
	return updates;
}

/**
 * Resolve temporary channel IDs (handle_/custom_) to canonical UC IDs.
 * Returns updates (new/resolved subs) and removals (temp IDs to delete).
 */
async function resolveTempChannels(
	subscriptions: StoredSubscription[],
	tempSubs: StoredSubscription[],
	apiKey: string,
): Promise<RefreshResult> {
	const subsById = new Map(subscriptions.map((s) => [s.id, s]));

	const updates: StoredSubscription[] = [];
	const removals: string[] = [];

	for (const sub of tempSubs) {
		const inputType = sub.id.startsWith("handle_") ? "handle" : "custom_url";
		const inputValue = sub.id.replace(/^(handle_|custom_)/, "");

		try {
			const channelInfo = await fetchChannelInfo(
				{ type: inputType, value: inputValue, originalInput: inputValue },
				apiKey,
			);

			if (!channelInfo) continue;

			removals.push(sub.id);

			const existing = subsById.get(channelInfo.id);
			if (existing) {
				updates.push({
					...existing,
					thumbnail: channelInfo.thumbnail,
					title: channelInfo.title,
					description: channelInfo.description,
					customUrl: channelInfo.customUrl,
				});
			} else {
				updates.push({
					id: channelInfo.id,
					title: channelInfo.title,
					description: channelInfo.description || "",
					thumbnail: channelInfo.thumbnail || "",
					customUrl: channelInfo.customUrl,
					addedAt: sub.addedAt,
					isFavorite: sub.isFavorite,
					isMuted: sub.isMuted,
					group: sub.group,
				});
			}
		} catch (error) {
			// Intentionally continue to next temp channel — partial resolution is better than aborting all.
			console.error(`Failed to resolve temporary ID ${sub.id}:`, error);
		}
	}

	return { updates, removals };
}

/**
 * Refresh all channel details (thumbnails, titles, etc.) using the YouTube API.
 * Resolves temporary IDs and batch-updates real ones.
 */
export async function refreshAllChannels(
	subscriptions: StoredSubscription[] | undefined,
	apiKey: string,
	queryClient: QueryClient,
): Promise<void> {
	if (!subscriptions || subscriptions.length === 0 || !apiKey) return;

	const realIds = subscriptions
		.filter((sub) => sub.id.startsWith("UC"))
		.map((sub) => sub.id);
	const tempSubs = subscriptions.filter(
		(sub) => sub.id.startsWith("handle_") || sub.id.startsWith("custom_"),
	);

	const realUpdates = await fetchRealChannelUpdates(
		subscriptions,
		realIds,
		apiKey,
	);
	const { updates: tempUpdates, removals } = await resolveTempChannels(
		subscriptions,
		tempSubs,
		apiKey,
	);

	const allUpdates = [...realUpdates, ...tempUpdates];

	for (const id of removals) {
		await removeSubscription(id);
	}

	if (allUpdates.length > 0) {
		await addSubscriptions(allUpdates);
	}

	if (removals.length > 0 || allUpdates.length > 0) {
		queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY });
	}
}
