import { createRequire } from "node:module";
import { describe, expect, it, vi, beforeEach } from "vitest";

const require = createRequire(import.meta.url);
const { createFeedAggregator, __test__ } = require("./feed-aggregator");

// ── Helpers ──────────────────────────────────────────────────

function createMockAppStore(overrides = {}) {
	let data = overrides.data || {
		subscriptions: [],
		settings: {},
		redirects: {},
	};
	let videoCache = overrides.videoCache || {
		videos: [],
		lastUpdated: null,
		totalChannels: 0,
		totalVideos: 0,
		channelRefreshes: {},
		shortsStatusById: {},
	};

	return {
		readData: vi.fn(async () => JSON.parse(JSON.stringify(data))),
		writeData: vi.fn(async (d) => {
			data = d;
			return d;
		}),
		updateData: vi.fn(async (_fallback, updater) => {
			const current = JSON.parse(JSON.stringify(data));
			const updated = await updater(current);
			data = updated || current;
			return data;
		}),
		readVideoCache: vi.fn(async () => JSON.parse(JSON.stringify(videoCache))),
		writeVideoCache: vi.fn(async (c) => {
			videoCache = c;
			return c;
		}),
		getCurrentRevision: vi.fn(() => 1),
		reset(overrides2 = {}) {
			data = overrides2.data || {
				subscriptions: [],
				settings: {},
				redirects: {},
			};
			videoCache = overrides2.videoCache || {
				videos: [],
				lastUpdated: null,
				totalChannels: 0,
				totalVideos: 0,
				channelRefreshes: {},
				shortsStatusById: {},
			};
		},
	};
}

// ── Tests ─────────────────────────────────────────────────────

describe("feed aggregator — refreshBatch (unit)", () => {
	it("refreshes a batch and preserves subscription metadata updates", async () => {
		const subscriptions = [
			{ id: "UC_1", title: "One", thumbnail: null },
			{
				id: "UC_2",
				title: "Two",
				thumbnail: "https://example.com/thumb.jpg",
			},
		];
		const fetchedChannelResults = [];
		const fetchChannelFeed = vi.fn(async (id) => ({
			videos: [
				{
					id: `${id}-video`,
					channelId: id,
					publishedAt: "2026-05-31T18:00:00.000Z",
				},
			],
			channelMetadata: { title: `${id}-updated`, thumbnail: null },
		}));
		const fetchChannelThumbnail = vi.fn(
			async (id) => `https://thumb.example/${id}.jpg`,
		);

		const result = await __test__.refreshBatch(
			[{ id: "UC_1" }, { id: "UC_2" }],
			subscriptions,
			fetchedChannelResults,
			{ fetchChannelFeed, fetchChannelThumbnail },
		);

		expect(fetchChannelFeed).toHaveBeenCalledTimes(2);
		expect(fetchChannelThumbnail).toHaveBeenCalledTimes(1);
		expect(subscriptions[0].title).toBe("UC_1-updated");
		expect(subscriptions[0].thumbnail).toBe("https://thumb.example/UC_1.jpg");
		expect(subscriptions[1].thumbnail).toBe("https://example.com/thumb.jpg");
		expect(fetchedChannelResults).toHaveLength(2);
		expect(result.batchRefreshResults).toHaveLength(2);
		expect(result.batchVideos).toEqual([
			{
				id: "UC_1-video",
				channelId: "UC_1",
				publishedAt: "2026-05-31T18:00:00.000Z",
			},
			{
				id: "UC_2-video",
				channelId: "UC_2",
				publishedAt: "2026-05-31T18:00:00.000Z",
			},
		]);
	});
});

describe("feed aggregator — status (unit)", () => {
	it("updates running aggregation status with an explicit startedAt timestamp", () => {
		__test__.setRunningAggregationStatus({
			skippedChannels: 3,
			subscriptions: [{ id: "UC_1" }, { id: "UC_2" }],
			existingVideos: [{ id: "video-1" }],
			startedAt: "2026-05-31T18:00:00.000Z",
		});

		expect(__test__.getAggregationStatus()).toMatchObject({
			state: "running",
			current: 3,
			total: 2,
			videos: 1,
			errors: 0,
			startedAt: "2026-05-31T18:00:00.000Z",
			completedAt: null,
		});
	});

	it("returns the same refresh id while a manual refresh is active", async () => {
		const mockStore = createMockAppStore();
		const aggregator = createFeedAggregator(mockStore);
		const first = aggregator.requestRefresh();
		const second = aggregator.requestRefresh();

		expect(first.refreshId).toBeTruthy();
		expect(second.refreshId).toBe(first.refreshId);
		expect(second.reused).toBe(true);
		await Promise.all([first.promise, second.promise]);

		const next = aggregator.requestRefresh();
		expect(next.reused).toBe(false);
		expect(next.refreshId).not.toBe(first.refreshId);
		await next.promise;
	});
});

describe("feed aggregator — runAggregation (characterization)", () => {
	let mockStore;
	let aggregator;

	beforeEach(() => {
		mockStore = createMockAppStore();
		aggregator = createFeedAggregator(mockStore);
	});

	it("completes without error when there are no subscriptions", async () => {
		await aggregator.runAggregation();

		expect(mockStore.updateData).toHaveBeenCalled();
		expect(mockStore.writeVideoCache).toHaveBeenCalled();
	});

	it("writes subscription metadata and video cache with active content", async () => {
		const subscriptions = [
			{ id: "UC_A", title: "Channel A" },
			{ id: "UC_B", title: "Channel B" },
		];

		// Pre-populate channel refreshes so getChannelsDueForRefresh
		// skips all of them (no feed fetching needed for this test).
		const recent = new Date().toISOString();
		const videoCache = {
			videos: [],
			lastUpdated: recent,
			totalChannels: 2,
			totalVideos: 0,
			channelRefreshes: {
				UC_A: { lastFetchedAt: recent },
				UC_B: { lastFetchedAt: recent },
			},
			shortsStatusById: {},
		};

		mockStore.reset({
			data: { subscriptions, settings: {}, redirects: {} },
			videoCache,
		});

		await aggregator.runAggregation();

		// Data should have been written via the merge path
		expect(mockStore.updateData).toHaveBeenCalled();
		const updateCall = mockStore.updateData.mock.calls.at(-1);
		const mergeResult = await updateCall[1]({
			subscriptions,
			settings: {},
			redirects: {},
		});
		expect(mergeResult.subscriptions).toHaveLength(2);

		// Video cache should have been written
		expect(mockStore.writeVideoCache).toHaveBeenCalled();
		const lastWriteCache = mockStore.writeVideoCache.mock.calls.at(-1)[0];
		expect(lastWriteCache.totalChannels).toBe(2);
	});

	it("preserves redirects in the written data", async () => {
		const subscriptions = [{ id: "UC_A", title: "Channel A" }];
		const redirects = {
			"@OldHandle": "UC_A",
			old_channel_id: "UC_A",
		};

		const recent = new Date().toISOString();
		mockStore.reset({
			data: { subscriptions, settings: {}, redirects },
			videoCache: {
				videos: [],
				lastUpdated: recent,
				totalChannels: 1,
				totalVideos: 0,
				channelRefreshes: { UC_A: { lastFetchedAt: recent } },
				shortsStatusById: {},
			},
		});

		await aggregator.runAggregation();

		expect(mockStore.updateData).toHaveBeenCalled();
		const updateCall = mockStore.updateData.mock.calls.at(-1);
		const mergeResult = await updateCall[1]({
			subscriptions,
			settings: {},
			redirects,
		});
		expect(mergeResult.redirects).toEqual(redirects);
	});
});

describe("feed aggregator — aggregateOnStartupIfStale (characterization)", () => {
	let mockStore;

	beforeEach(() => {
		mockStore = createMockAppStore();
	});

	it("skips aggregation when the video cache is fresh and matches subscriptions", async () => {
		const subscriptions = [{ id: "UC_FRESH", title: "Fresh Channel" }];
		const videoCache = {
			videos: [
				{
					id: "vid-1",
					channelId: "UC_FRESH",
					publishedAt: "2026-06-01T12:00:00.000Z",
				},
			],
			lastUpdated: new Date().toISOString(),
			totalChannels: 1,
			totalVideos: 1,
			channelRefreshes: {
				UC_FRESH: { lastFetchedAt: new Date().toISOString() },
			},
			shortsStatusById: { "vid-1": false },
		};

		mockStore.reset({
			data: { subscriptions, settings: {}, redirects: {} },
			videoCache,
		});
		const aggregator = createFeedAggregator(mockStore);

		await aggregator.aggregateOnStartupIfStale();

		// Should NOT have triggered an aggregation — no write calls
		expect(mockStore.writeData).not.toHaveBeenCalled();
		expect(mockStore.writeVideoCache).not.toHaveBeenCalled();
	});

	it("triggers aggregation when cache is stale", async () => {
		const subscriptions = [{ id: "UC_STALE", title: "Stale Channel" }];
		const videoCache = {
			videos: [],
			lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			totalChannels: 1,
			totalVideos: 0,
			channelRefreshes: {},
			shortsStatusById: {},
		};

		mockStore.reset({
			data: { subscriptions, settings: {}, redirects: {} },
			videoCache,
		});
		const aggregator = createFeedAggregator(mockStore);

		await aggregator.aggregateOnStartupIfStale();

		// Should have triggered an aggregation (fire-and-forget via aggregateFeeds)
		expect(mockStore.readData).toHaveBeenCalled();
		expect(mockStore.readVideoCache).toHaveBeenCalled();
	});

	it("does not clobber subscriptions added during aggregation", async () => {
		const subscriptions = [{ id: "UC001", title: "Channel A" }];
		const videoCache = {
			videos: [],
			lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			totalChannels: 1,
			totalVideos: 0,
			channelRefreshes: {},
			shortsStatusById: {},
		};

		mockStore.reset({
			data: { subscriptions, settings: {}, redirects: {} },
			videoCache,
		});

		// Simulate a concurrent add: updateData's re-read returns TWO subs
		const concurrentAddData = {
			subscriptions: [
				{ id: "UC001", title: "Channel A" },
				{ id: "UC002", title: "Channel B" },
			],
			settings: {},
			redirects: {},
		};
		mockStore.updateData = vi.fn(async (_fallback, updater) => {
			const result = await updater(concurrentAddData);
			return result;
		});

		const aggregator = createFeedAggregator(mockStore);
		await aggregator.runAggregation();

		// The merge should preserve UC002 (the concurrent add)
		const updateCall = mockStore.updateData.mock.calls[0];
		const mergeResult = await updateCall[1](concurrentAddData);
		expect(mergeResult.subscriptions).toHaveLength(2);
		expect(
			mergeResult.subscriptions.find((s) => s.id === "UC002"),
		).toBeDefined();

		// writeData should NOT have been called for the final save
		expect(mockStore.writeData).not.toHaveBeenCalled();
	});
});
