import type { QueryClient } from "@tanstack/react-query";
import {
	setSubscriptionGroup as setStoredSubscriptionGroup,
	toggleFavorite as toggleStoredFavorite,
	toggleMute as toggleStoredMute,
	type StoredSubscription,
} from "./indexeddb";

const SUBSCRIPTIONS_QUERY_KEY = ["subscriptions"] as const;
const SUBSCRIPTIONS_COUNT_QUERY_KEY = ["subscriptions-count"] as const;

/**
 * Optimistically update the subscription cache, then invalidate for refetch.
 */
export function updateSubscriptionsCache(
	queryClient: QueryClient,
	updater: (subs: StoredSubscription[]) => StoredSubscription[],
): void {
	const current = queryClient.getQueryData<StoredSubscription[]>(
		SUBSCRIPTIONS_QUERY_KEY,
	);
	if (current) {
		queryClient.setQueryData(SUBSCRIPTIONS_QUERY_KEY, updater(current));
	}
	queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY });
}

/**
 * Toggle favorite state for a channel.
 */
export async function toggleFavoriteHandler(
	queryClient: QueryClient,
	channelId: string,
): Promise<void> {
	await toggleStoredFavorite(channelId);
	updateSubscriptionsCache(queryClient, (subs) =>
		subs.map((sub) =>
			sub.id === channelId ? { ...sub, isFavorite: !sub.isFavorite } : sub,
		),
	);
}

/**
 * Toggle mute state for a channel.
 */
export async function toggleMuteHandler(
	queryClient: QueryClient,
	channelId: string,
): Promise<void> {
	await toggleStoredMute(channelId);
	updateSubscriptionsCache(queryClient, (subs) =>
		subs.map((sub) =>
			sub.id === channelId ? { ...sub, isMuted: !sub.isMuted } : sub,
		),
	);
}

/**
 * Set the group label for a channel.
 */
export async function setSubscriptionGroupHandler(
	queryClient: QueryClient,
	channelId: string,
	group: string,
): Promise<void> {
	await setStoredSubscriptionGroup(channelId, group);
	const trimmedGroup = group.trim();
	updateSubscriptionsCache(queryClient, (subs) =>
		subs.map((sub) =>
			sub.id === channelId ? { ...sub, group: trimmedGroup || undefined } : sub,
		),
	);
}

/**
 * Update cache after removing a subscription (optimistic decrement).
 */
export function handleRemovalCacheUpdate(
	queryClient: QueryClient,
	removedChannelId: string,
): void {
	queryClient.setQueryData<StoredSubscription[]>(
		SUBSCRIPTIONS_QUERY_KEY,
		(oldSubscriptions) => {
			if (!oldSubscriptions) return [];
			return oldSubscriptions.filter((sub) => sub.id !== removedChannelId);
		},
	);
	queryClient.setQueryData<number>(
		SUBSCRIPTIONS_COUNT_QUERY_KEY,
		(oldCount) => {
			return (oldCount || 0) - 1;
		},
	);
}

/**
 * Reset cache to empty after clearing all subscriptions.
 */
export function handleClearCacheUpdate(queryClient: QueryClient): void {
	queryClient.setQueryData<StoredSubscription[]>(SUBSCRIPTIONS_QUERY_KEY, []);
	queryClient.setQueryData<number>(SUBSCRIPTIONS_COUNT_QUERY_KEY, 0);
}
