export const SUBSCRIPTION_GROUPS_STORAGE_KEY = "subscription-groups";
export const SUBSCRIPTION_GROUPS_CHANGED_EVENT = "subscription-groups-changed";

export function normalizeSubscriptionGroups(value: unknown): string[] {
	if (!Array.isArray(value)) return [];

	return Array.from(
		new Set(
			value
				.filter((group): group is string => typeof group === "string")
				.map((group) => group.trim())
				.filter(Boolean),
		),
	).sort((a, b) => a.localeCompare(b));
}

export function readSubscriptionGroups(
	storage: Pick<Storage, "getItem"> = window.localStorage,
): string[] {
	try {
		const rawGroups = storage.getItem(SUBSCRIPTION_GROUPS_STORAGE_KEY);
		return normalizeSubscriptionGroups(rawGroups ? JSON.parse(rawGroups) : []);
	} catch {
		return [];
	}
}

export function writeSubscriptionGroups(
	groups: unknown,
	storage: Pick<Storage, "setItem"> = window.localStorage,
): string[] {
	const normalizedGroups = normalizeSubscriptionGroups(groups);
	storage.setItem(
		SUBSCRIPTION_GROUPS_STORAGE_KEY,
		JSON.stringify(normalizedGroups),
	);
	return normalizedGroups;
}
