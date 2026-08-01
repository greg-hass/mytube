import { describe, expect, it } from "vitest";
import type { StoredSubscription } from "./indexeddb";
import { inspectSubscriptionHealth } from "./subscription-health";

function subscription(
	partial: Partial<StoredSubscription> & Pick<StoredSubscription, "id">,
): StoredSubscription {
	return {
		title: "Channel",
		addedAt: 1,
		thumbnail: "https://example.com/channel.jpg",
		...partial,
	};
}

describe("inspectSubscriptionHealth", () => {
	it("reports temporary IDs and placeholder artwork", () => {
		const health = inspectSubscriptionHealth([
			subscription({
				id: "handle_example",
				thumbnail: "https://ui-avatars.com/api/?name=Channel",
			}),
			subscription({ id: "UC123" }),
		]);

		expect(health.unresolved.map(({ id }) => id)).toEqual(["handle_example"]);
		expect(health.placeholderThumbnails.map(({ id }) => id)).toEqual([
			"handle_example",
		]);
		expect(health.issueCount).toBe(2);
	});

	it("finds URL identity collisions but does not merge or infer from titles", () => {
		const health = inspectSubscriptionHealth([
			subscription({ id: "handle_example", title: "Same Name" }),
			subscription({
				id: "UC123",
				title: "Same Name",
				customUrl: "@example",
			}),
			subscription({ id: "UC456", title: "Same Name" }),
		]);

		expect(health.duplicateIdentityGroups).toHaveLength(1);
		expect(health.duplicateIdentityGroups[0].map(({ id }) => id)).toEqual([
			"handle_example",
			"UC123",
		]);
		expect(health.duplicateIdentityGroups.flat().map(({ id }) => id)).not.toContain(
			"UC456",
		);
	});

	it("reports blank titles and keeps healthy subscriptions clean", () => {
		const health = inspectSubscriptionHealth([
			subscription({ id: "UC123", title: "  " }),
			subscription({ id: "UC456" }),
		]);

		expect(health.missingTitles.map(({ id }) => id)).toEqual(["UC123"]);
		expect(health.unresolved).toHaveLength(0);
		expect(health.duplicateIdentityGroups).toHaveLength(0);
		expect(health.issueCount).toBe(1);

		const healthy = inspectSubscriptionHealth([
			subscription({ id: "UC789" }),
		]);
		expect(healthy.issueCount).toBe(0);
	});
});
