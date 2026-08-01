import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredSubscription } from "./indexeddb";

const mocks = vi.hoisted(() => ({
	addSubscriptions: vi.fn(),
	removeSubscription: vi.fn(),
	fetchChannelInfo: vi.fn(),
	invalidateQueries: vi.fn(),
}));

vi.mock("./indexeddb", () => ({
	addSubscriptions: mocks.addSubscriptions,
	removeSubscription: mocks.removeSubscription,
}));

vi.mock("./youtube-api", () => ({
	fetchChannelInfo: mocks.fetchChannelInfo,
	fetchChannelsBatch: vi.fn(),
}));

import { resolveTemporaryChannels } from "./channel-refresh";

const queryClient = { invalidateQueries: mocks.invalidateQueries } as never;

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

describe("resolveTemporaryChannels", () => {
	beforeEach(() => {
		mocks.addSubscriptions.mockReset().mockResolvedValue(undefined);
		mocks.removeSubscription.mockReset().mockResolvedValue(undefined);
		mocks.fetchChannelInfo.mockReset();
		mocks.invalidateQueries.mockReset();
	});

	it("resolves temporary subscriptions without refreshing canonical channels", async () => {
		mocks.fetchChannelInfo.mockResolvedValue({
			id: "UC_RESOLVED",
			title: "Resolved Channel",
			description: "Description",
			thumbnail: "https://example.com/resolved.jpg",
			customUrl: "@resolved",
		});

		const resolvedCount = await resolveTemporaryChannels(
			[
				subscription({ id: "handle_resolved", isFavorite: true, group: "News" }),
				subscription({ id: "UC_EXISTING" }),
			],
			"api-key",
			queryClient,
		);

		expect(resolvedCount).toBe(1);
		expect(mocks.fetchChannelInfo).toHaveBeenCalledOnce();
		expect(mocks.removeSubscription).toHaveBeenCalledWith("handle_resolved");
		expect(mocks.addSubscriptions).toHaveBeenCalledWith([
			expect.objectContaining({
				id: "UC_RESOLVED",
				isFavorite: true,
				group: "News",
			}),
		]);
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["subscriptions"],
		});
	});

	it("does nothing when no API key or temporary IDs are present", async () => {
		expect(
			await resolveTemporaryChannels(
				[subscription({ id: "UC_EXISTING" })],
				"api-key",
				queryClient,
			),
		).toBe(0);
		expect(
			await resolveTemporaryChannels(
				[subscription({ id: "handle_pending" })],
				"",
				queryClient,
			),
		).toBe(0);
		expect(mocks.fetchChannelInfo).not.toHaveBeenCalled();
	});
});
