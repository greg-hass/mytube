import type { StoredSubscription } from "./indexeddb";
import { hasPlaceholderThumbnail } from "./subscription-sync";
import { getChannelIdentityKeys } from "./channel-identity";

export type SubscriptionHealth = {
	unresolved: StoredSubscription[];
	placeholderThumbnails: StoredSubscription[];
	missingTitles: StoredSubscription[];
	duplicateIdentityGroups: StoredSubscription[][];
	issueCount: number;
};

function sortSubscriptions(
	subscriptions: StoredSubscription[],
): StoredSubscription[] {
	return [...subscriptions].sort(
		(left, right) =>
			(left.addedAt || 0) - (right.addedAt || 0) ||
			left.id.localeCompare(right.id),
	);
}

function isTemporarySubscription(subscription: StoredSubscription): boolean {
	return (
		subscription.id.startsWith("handle_") ||
		subscription.id.startsWith("custom_")
	);
}

function findDuplicateIdentityGroups(
	subscriptions: StoredSubscription[],
): StoredSubscription[][] {
	const subscriptionsByIdentity = new Map<string, StoredSubscription[]>();

	for (const subscription of subscriptions) {
		for (const identityKey of getChannelIdentityKeys(subscription)) {
			const group = subscriptionsByIdentity.get(identityKey) || [];
			group.push(subscription);
			subscriptionsByIdentity.set(identityKey, group);
		}
	}

	const groups = new Map<string, StoredSubscription[]>();
	for (const subscriptionsWithIdentity of subscriptionsByIdentity.values()) {
		const uniqueSubscriptions = Array.from(
			new Map(
				subscriptionsWithIdentity.map((subscription) => [
					subscription.id,
					subscription,
				]),
			).values(),
		);
		if (uniqueSubscriptions.length < 2) continue;

		const sorted = sortSubscriptions(uniqueSubscriptions);
		const signature = sorted.map((subscription) => subscription.id).join("\u0000");
		groups.set(signature, sorted);
	}

	return Array.from(groups.values()).sort(
		(left, right) =>
			left[0].id.localeCompare(right[0].id) ||
			left.length - right.length,
	);
}

/**
 * Inspect stored subscriptions without changing them. Duplicate groups are
 * emitted only when a stable channel identity (ID, handle, or custom URL)
 * collides; matching titles alone are intentionally not treated as proof.
 */
export function inspectSubscriptionHealth(
	subscriptions: StoredSubscription[],
): SubscriptionHealth {
	const unresolved = subscriptions.filter(isTemporarySubscription);
	const placeholderThumbnails = subscriptions.filter(hasPlaceholderThumbnail);
	const missingTitles = subscriptions.filter(
		(subscription) =>
			typeof subscription.title !== "string" || !subscription.title.trim(),
	);
	const duplicateIdentityGroups = findDuplicateIdentityGroups(subscriptions);
	const duplicateCount = duplicateIdentityGroups.reduce(
		(total, group) => total + group.length - 1,
		0,
	);

	return {
		unresolved,
		placeholderThumbnails,
		missingTitles,
		duplicateIdentityGroups,
		issueCount:
			unresolved.length +
			placeholderThumbnails.length +
			missingTitles.length +
			duplicateCount,
	};
}
