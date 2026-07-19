import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
	CHANNEL_REFRESH_INTERVAL_MS,
	DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
	getScheduledRefreshConfig,
	getChannelsDueForRefresh,
	getNextChannelsForRefresh,
	mergeChannelRefreshes,
	summarizeFailedChannels,
	startScheduledRefresh,
	stopScheduledRefresh,
	buildVideoFromFeedItem,
	fetchChannelFeed,
	resolveYouTubeShortsStatus,
	enrichVideosWithShortsStatus,
	backfillArchivedShortsStatus,
	startArchivedShortsStatusBackfill,
	ARCHIVED_SHORTS_BACKFILL_RETRY_INTERVAL_MS,
	isArchivedShortsBackfillDue,
	applyLocalShortsMetadata,
} = require("./feed-aggregator");

const FIXTURE_THUMBNAIL = "https://example.com/thumb.jpg"; // ast-grep-ignore: hardcoded-url-js (test fixture)
const FIXTURE_YOUTUBE = "https://www.youtube.com/watch?v/unknown-video"; // ast-grep-ignore: hardcoded-url-js (test fixture)
const FIXTURE_YT_THUMB =
	"https://i.ytimg.com/vi/portrait-thumbnail-short/oar2.jpg"; // ast-grep-ignore: hardcoded-url-js (test fixture)

describe("feed refresh policy", () => {
	afterEach(() => {
		vi.useRealTimers();
		stopScheduledRefresh();
	});

	it("refreshes ALL channels every cycle regardless of last-fetched time", () => {
		const subscriptions = [
			{ id: "UC_FRESH" },
			{ id: "UC_DUE" },
			{ id: "UC_NEW" },
		];

		const due = getChannelsDueForRefresh(subscriptions);

		expect(due.map((channel) => channel.id)).toEqual([
			"UC_FRESH",
			"UC_DUE",
			"UC_NEW",
		]);
	});

	it("keeps refresh metadata only for subscribed channels and updates fetched channels", () => {
		const merged = mergeChannelRefreshes(
			{
				UC_KEEP: { lastFetchedAt: "2026-05-06T18:00:00.000Z" },
				UC_REMOVED: { lastFetchedAt: "2026-05-06T18:00:00.000Z" },
			},
			new Set(["UC_KEEP", "UC_NEW"]),
			[{ id: "UC_NEW" }],
			"2026-05-06T20:00:00.000Z",
		);

		expect(merged).toEqual({
			UC_KEEP: { lastFetchedAt: "2026-05-06T18:00:00.000Z" },
			UC_NEW: {
				lastFetchedAt: "2026-05-06T20:00:00.000Z",
				lastSuccessfulFetchAt: "2026-05-06T20:00:00.000Z",
				lastError: null,
				source: "rss",
				outcome: "success",
				itemHash: null,
			},
		});
	});

	it("summarizes failed channel refreshes for status output", () => {
		const failedChannels = summarizeFailedChannels(
			[
				{
					id: "UC_OK",
					title: "OK",
					expected: true,
					videos: [{ id: "video-1" }],
					channelMetadata: { title: "OK" },
				},
				{
					id: "UC_BAD",
					title: "Bad Channel",
					expected: true,
					videos: [],
					channelMetadata: null,
					errorStatus: 404,
				},
				{
					id: "UC_SKIPPED",
					title: "Skipped",
					expected: false,
					videos: [],
					channelMetadata: null,
				},
			],
			{
				UC_BAD: { lastSuccessfulFetchAt: "2026-05-06T18:00:00.000Z" },
			},
		);

		expect(failedChannels).toEqual([
			{
				id: "UC_BAD",
				title: "Bad Channel",
				reason: "RSS feed failed with HTTP 404",
				lastSuccessfulFetchAt: "2026-05-06T18:00:00.000Z",
			},
		]);
	});

	it("returns transient RSS failures without an internal retry loop", async () => {
		const feedParser = {
			parseString: vi.fn(),
		};
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response("", { status: 500 }));

		const result = await fetchChannelFeed("UC_RECOVERED", feedParser, {
			fetchImpl,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			outcome: "transient-failure",
			videos: [],
			errorStatus: 500,
		});
	});

	it("does not retry permanent 404 RSS feed failures", async () => {
		const feedParser = {
			parseString: vi.fn(),
		};
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response("", { status: 404 }));

		const result = await fetchChannelFeed("UC_MISSING", feedParser, {
			fetchImpl,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			videos: [],
			channelMetadata: null,
			errorStatus: 404,
			transient: false,
		});
	});

	it("uses the YouTube API fallback when RSS returns no feed", async () => {
		const feedParser = {
			parseString: vi.fn(),
		};
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response("", { status: 404 }));
		const youtubeApiFallback = vi.fn().mockResolvedValue({
			videos: [{ id: "fallback-video", channelId: "UC_FALLBACK" }],
			channelMetadata: { title: "Fallback Channel", thumbnail: null },
		});

		const result = await fetchChannelFeed("UC_FALLBACK", feedParser, {
			fetchImpl,
			youtubeApiFallback,
		});

		expect(youtubeApiFallback).toHaveBeenCalledWith("UC_FALLBACK");
		expect(result).toMatchObject({
			outcome: "success",
			source: "youtube-api",
			channelMetadata: { title: "Fallback Channel", thumbnail: null },
			videos: [
				{
					id: "fallback-video",
					channelId: "UC_FALLBACK",
				},
			],
		});
	});

	it("keeps the original RSS failure when no API fallback is configured", async () => {
		const feedParser = {
			parseString: vi.fn(),
		};
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(new Response("", { status: 404 }));
		const result = await fetchChannelFeed("UC_EMPTY", feedParser, {
			fetchImpl,
		});

		expect(result).toMatchObject({
			videos: [],
			channelMetadata: null,
			errorStatus: 404,
			transient: false,
		});
	});

	it("maps RSS media descriptions onto cached videos so Shorts hashtags are filterable", () => {
		const video = buildVideoFromFeedItem(
			{
				id: "yt:video:short-video",
				title: "Quick clip",
				pubDate: "2026-05-13T12:00:00.000Z",
				mediaGroup: {
					"media:thumbnail": [{ $: { url: FIXTURE_THUMBNAIL } }],
					"media:description": ["A clipped segment #shorts"],
				},
			},
			{
				channelId: "UC123",
				channelTitle: "Test Channel",
			},
		);

		expect(video).toMatchObject({
			id: "short-video",
			title: "Quick clip",
			channelId: "UC123",
			channelTitle: "Test Channel",
			thumbnail: FIXTURE_THUMBNAIL,
			description: "A clipped segment #shorts",
			duration: null,
			isShort: true,
		});
	});

	it("marks obvious archived Shorts from local metadata without probing YouTube", () => {
		const videos = [
			{
				id: "tagged-short",
				title: "Quick clip #shorts",
				description: "",
				duration: null,
			},
			{
				id: "duration-short",
				title: "Quick clip",
				description: "",
				duration: 45,
			},
			{
				id: "portrait-thumbnail-short",
				title: "Quick clip",
				description: "",
				thumbnail: FIXTURE_YT_THUMB,
				duration: null,
			},
		];
		const shortsStatusById = {};

		applyLocalShortsMetadata(videos, shortsStatusById);

		expect(shortsStatusById).toEqual({
			"tagged-short": true,
			"duration-short": true,
			"portrait-thumbnail-short": true,
		});
		expect(videos.every((video) => video.isShort === true)).toBe(true);
	});

	it("does not call YouTube for videos that local metadata already identifies as Shorts", async () => {
		const httpClient = {
			get: vi.fn(),
		};
		const videos = [
			{
				id: "tagged-short",
				title: "Quick clip #shorts",
				description: "",
				duration: null,
			},
		];

		await enrichVideosWithShortsStatus(videos, {}, httpClient);

		expect(httpClient.get).not.toHaveBeenCalled();
		expect(videos[0].isShort).toBe(true);
	});

	it("backfills archived Shorts status for every unchecked cached video", async () => {
		const shortsStatusById = {};
		const videos = Array.from({ length: 300 }, (_, index) => ({
			id: `video-${index}`,
			title: `Video ${index}`,
			description: "",
			duration: null,
		}));

		await backfillArchivedShortsStatus(videos, shortsStatusById, {
			get: vi.fn().mockResolvedValue({
				status: 303,
				headers: { location: "https://www.youtube.com/watch?v=normal-video" },
			}),
		});

		expect(Object.keys(shortsStatusById)).toHaveLength(300);
		expect(shortsStatusById["video-299"]).toBe(false);
	});

	it("does not recheck videos with cached non-Short status during archived backfill", async () => {
		const shortsStatusById = {
			"longer-short": false,
		};
		const videos = [
			{
				id: "longer-short",
				title: "A longer vertical Short",
				description: "",
				duration: 90,
			},
		];
		const httpClient = {
			get: vi.fn().mockResolvedValue({ status: 200, headers: {} }),
		};

		await backfillArchivedShortsStatus(videos, shortsStatusById, httpClient);

		expect(httpClient.get).not.toHaveBeenCalled();
		expect(shortsStatusById["longer-short"]).toBe(false);
	});

	it("runs archived Shorts backfill as deferred maintenance without blocking refresh completion", async () => {
		let resolveLookup;
		const lookupFinished = new Promise((resolve) => {
			resolveLookup = resolve;
		});
		const onComplete = vi.fn();
		const shortsStatusById = {};

		const pending = startArchivedShortsStatusBackfill(
			[
				{
					id: "unknown-video",
					title: "Normal upload",
					description: "",
					duration: null,
				},
			],
			shortsStatusById,
			{
				httpClient: {
					get: vi.fn(() =>
						lookupFinished.then(() => ({
							status: 303,
							headers: {
								location: FIXTURE_YOUTUBE,
							},
						})),
					),
				},
				onComplete,
			},
		);

		expect(onComplete).not.toHaveBeenCalled();
		resolveLookup();
		await pending;

		expect(shortsStatusById["unknown-video"]).toBe(false);
		expect(onComplete).toHaveBeenCalledWith(shortsStatusById);
	});

	it("cools down repeated archived Shorts backfills when unresolved videos remain", () => {
		const now = Date.parse("2026-05-23T08:00:00.000Z");

		expect(isArchivedShortsBackfillDue(null, now)).toBe(true);
		expect(
			isArchivedShortsBackfillDue(
				now,
				now + ARCHIVED_SHORTS_BACKFILL_RETRY_INTERVAL_MS - 1,
			),
		).toBe(false);
		expect(
			isArchivedShortsBackfillDue(
				now,
				now + ARCHIVED_SHORTS_BACKFILL_RETRY_INTERVAL_MS,
			),
		).toBe(true);
	});

	it("resolves Shorts status from the canonical YouTube Shorts URL", async () => {
		await expect(
			resolveYouTubeShortsStatus("short-video", {
				get: vi.fn().mockResolvedValue({ status: 200, headers: {} }),
			}),
		).resolves.toBe(true);

		await expect(
			resolveYouTubeShortsStatus("normal-video", {
				get: vi.fn().mockResolvedValue({
					status: 303,
					headers: { location: "https://www.youtube.com/watch?v=normal-video" },
				}),
			}),
		).resolves.toBe(false);

		await expect(
			resolveYouTubeShortsStatus("redirected-short", {
				get: vi.fn().mockResolvedValue({
					status: 200,
					request: {
						res: {
							responseUrl: "https://www.youtube.com/shorts/redirected-short",
						},
					},
				}),
			}),
		).resolves.toBe(true);

		await expect(
			resolveYouTubeShortsStatus("redirected-normal", {
				get: vi.fn().mockResolvedValue({
					status: 200,
					request: {
						res: {
							responseUrl: "https://www.youtube.com/watch?v=redirected-normal",
						},
					},
				}),
			}),
		).resolves.toBe(false);
	});

	it("uses a visible scheduled refresh config with safe Docker env overrides", () => {
		expect(getScheduledRefreshConfig({})).toEqual({
			enabled: true,
			refreshOnStartup: true,
			intervalMs: DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
		});

		expect(
			getScheduledRefreshConfig({
				FEED_REFRESH_ENABLED: "false",
				FEED_REFRESH_ON_START: "false",
				FEED_REFRESH_INTERVAL_MINUTES: "30",
			}),
		).toEqual({
			enabled: false,
			refreshOnStartup: false,
			intervalMs: 30 * 60 * 1000,
		});
	});

	it("falls back to the default scheduled refresh interval for invalid values", () => {
		expect(
			getScheduledRefreshConfig({ FEED_REFRESH_INTERVAL_MINUTES: "0" })
				.intervalMs,
		).toBe(DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS);
		expect(
			getScheduledRefreshConfig({
				FEED_REFRESH_INTERVAL_MINUTES: "not-a-number",
			}).intervalMs,
		).toBe(DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS);
	});

	it("uses a 5 minute scheduled default and 15 minute per-channel refresh interval", () => {
		expect(DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS).toBe(5 * 60 * 1000);
		expect(CHANNEL_REFRESH_INTERVAL_MS).toBe(15 * 60 * 1000);
	});

	it("forces scheduled refreshes so every subscribed channel is checked every interval", async () => {
		vi.useFakeTimers();
		const aggregateFeeds = vi.fn().mockResolvedValue(undefined);

		startScheduledRefresh(
			{
				enabled: true,
				refreshOnStartup: true,
				intervalMs: 100,
			},
			{ aggregateFeeds },
		);

		await vi.advanceTimersByTimeAsync(100);

		expect(aggregateFeeds).toHaveBeenCalledWith({
			force: true,
			reason: "scheduled",
		});
	});

	it("does not start a second scheduled refresh while the previous one is still running", async () => {
		vi.useFakeTimers();
		let finishRefresh;
		const aggregateFeeds = vi.fn(
			() =>
				new Promise((resolve) => {
					finishRefresh = resolve;
				}),
		);

		startScheduledRefresh(
			{
				enabled: true,
				refreshOnStartup: true,
				intervalMs: 100,
			},
			{ aggregateFeeds },
		);

		await vi.advanceTimersByTimeAsync(100);
		await vi.advanceTimersByTimeAsync(100);

		expect(aggregateFeeds).toHaveBeenCalledTimes(1);

		finishRefresh();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(100);

		expect(aggregateFeeds).toHaveBeenCalledTimes(2);
	});
});

describe("getNextChannelsForRefresh", () => {
	it("orders channels by oldest lastSuccessfulFetchAt first", () => {
		const result = getNextChannelsForRefresh(
			[
				{ id: "UC_FRESH", title: "Fresh" },
				{ id: "UC_STALE", title: "Stale" },
				{ id: "UC_NEVER", title: "Never" },
			],
			{
				UC_FRESH: { lastSuccessfulFetchAt: "2026-06-01T12:00:00.000Z" },
				UC_STALE: { lastSuccessfulFetchAt: "2026-05-30T12:00:00.000Z" },
			},
			{ limit: 3 },
		);

		expect(result.map((entry) => entry.id)).toEqual([
			"UC_NEVER",
			"UC_STALE",
			"UC_FRESH",
		]);
	});

	it("respects the requested limit", () => {
		const subs = Array.from({ length: 10 }, (_, i) => ({
			id: `UC_${i}`,
			title: `Channel ${i}`,
		}));
		const result = getNextChannelsForRefresh(subs, {}, { limit: 3 });
		expect(result).toHaveLength(3);
		expect(result.map((entry) => entry.id)).toEqual(["UC_0", "UC_1", "UC_2"]);
	});

	it("returns an empty list when no subscriptions are present", () => {
		expect(getNextChannelsForRefresh([], {}, { limit: 5 })).toEqual([]);
	});
});
