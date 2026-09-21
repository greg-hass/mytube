import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
	buildVideoFromFeedItem,
	classifyFeedFailure,
	createVideoItemHash,
	fetchChannelFeed,
	fetchChannelThumbnail,
} = require("./feed-fetcher");

describe("RSS-first feed fetcher", () => {
	it("normalizes high-resolution regular and Shorts thumbnails", () => {
		expect(
			buildVideoFromFeedItem(
				{
					id: "yt:video:regular",
					title: "Regular upload",
					mediaGroup: {
						"media:thumbnail": {
							$: { url: "https://i.ytimg.com/vi/regular/hqdefault.jpg" },
						},
					},
				},
				{ channelId: "UC_TEST", channelTitle: "Channel" },
			),
		).toMatchObject({
			id: "regular",
			thumbnail: "https://i.ytimg.com/vi/regular/maxresdefault.jpg",
		});
		expect(
			buildVideoFromFeedItem(
				{ id: "yt:video:short", title: "Clip #shorts" },
				{ channelId: "UC_TEST", channelTitle: "Channel" },
			),
		).toMatchObject({ id: "short", isShort: true });
	});

	it("decodes HTML entities in RSS video metadata", () => {
		expect(
			buildVideoFromFeedItem(
				{
					id: "yt:video:encoded",
					title: "Fox News Doesn&#39;t Support The Troops",
					contentSnippet: "Rock &amp; roll",
				},
				{
					channelId: "UC_TEST",
					channelTitle: "The Majority Report &amp; More",
				},
			),
		).toMatchObject({
			title: "Fox News Doesn't Support The Troops",
			description: "Rock & roll",
			channelTitle: "The Majority Report & More",
		});
	});

	it("creates deterministic hashes from ordered unique video IDs", () => {
		expect(
			createVideoItemHash([{ id: "a" }, { id: "b" }, { id: "a" }]),
		).toBe(createVideoItemHash([{ id: "a" }, { id: "b" }]));
		expect(createVideoItemHash([{ id: "b" }, { id: "a" }])).not.toBe(
			createVideoItemHash([{ id: "a" }, { id: "b" }]),
		);
	});

	it("returns not-modified when the item hash matches", async () => {
		const feedParser = {
			parseString: vi.fn(async () => ({
				title: "Channel",
				items: [{ id: "yt:video:a", title: "A" }],
			})),
		};
		const itemHash = createVideoItemHash([{ id: "a" }]);
		const fetchImpl = vi.fn(async () =>
			new Response("<feed />", {
				status: 200,
				headers: { etag: '"upstream-etag"', "last-modified": "today" },
			}),
		);

		await expect(
			fetchChannelFeed("UC_TEST", feedParser, {
				fetchImpl,
				previousItemHash: itemHash,
				etag: '"previous-etag"',
			}),
		).resolves.toMatchObject({
			outcome: "not-modified",
			itemHash,
			source: "rss",
			etag: '"upstream-etag"',
			lastModified: "today",
			videos: [],
		});
		expect(fetchImpl).toHaveBeenCalledWith(
			"https://www.youtube.com/feeds/videos.xml?channel_id=UC_TEST",
			expect.objectContaining({
				headers: expect.objectContaining({
					"user-agent": "Feedy/1.0",
					"if-none-match": '"previous-etag"',
				}),
			}),
		);
		expect(feedParser.parseString).toHaveBeenCalledWith("<feed />");
	});

	it("returns not-modified for an upstream HTTP 304", async () => {
		const feedParser = { parseString: vi.fn() };
		const fetchImpl = vi.fn(async () =>
			new Response(null, { status: 304, headers: { etag: '"same"' } }),
		);

		await expect(
			fetchChannelFeed("UC_TEST", feedParser, {
				fetchImpl,
				etag: '"same"',
				previousItemHash: "hash",
			}),
		).resolves.toMatchObject({
			outcome: "not-modified",
			etag: '"same"',
			itemHash: "hash",
			videos: [],
		});
		expect(feedParser.parseString).not.toHaveBeenCalled();
	});

	it("classifies retryable and permanent failures", () => {
		expect(classifyFeedFailure({ statusCode: 429 })).toBe("transient-failure");
		expect(classifyFeedFailure({ response: { status: 503 } })).toBe(
			"transient-failure",
		);
		expect(classifyFeedFailure({ statusCode: 404 })).toBe("permanent-failure");
	});

	it("uses the YouTube API once after RSS failure", async () => {
		const feedParser = {
			parseString: vi.fn(),
		};
		const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));
		const youtubeApiFallback = vi.fn(async () => ({
			videos: [{ id: "api-video", channelId: "UC_TEST" }],
			channelMetadata: { title: "Channel", thumbnail: null },
		}));

		await expect(
			fetchChannelFeed("UC_TEST", feedParser, {
				fetchImpl,
				youtubeApiFallback,
			}),
		).resolves.toMatchObject({
			outcome: "success",
			source: "youtube-api",
			videos: [{ id: "api-video", channelId: "UC_TEST" }],
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(youtubeApiFallback).toHaveBeenCalledTimes(1);
	});

	it("preserves a classified failure when no API fallback is available", async () => {
		const feedParser = {
			parseString: vi.fn(),
		};
		const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));

		await expect(
			fetchChannelFeed("UC_TEST", feedParser, { fetchImpl }),
		).resolves.toMatchObject({
			outcome: "permanent-failure",
			videos: [],
			errorStatus: 404,
			errorMessage: "Feed returned 404",
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});

describe("fetchChannelThumbnail", () => {
	it("uses the YouTube Data API when a key is provided", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				items: [
					{
						snippet: {
							thumbnails: {
								high: { url: "https://yt3.ggpht.com/api-avatar.jpg" },
							},
						},
					},
				],
			}),
		}));
		const httpClient = { get: vi.fn() };

		const url = await fetchChannelThumbnail(
			"UC_TEST",
			"key123",
			httpClient,
			fetchImpl,
		);

		expect(url).toBe("https://yt3.ggpht.com/api-avatar.jpg");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(httpClient.get).not.toHaveBeenCalled();
		const calledUrl = fetchImpl.mock.calls[0][0];
		expect(calledUrl).toContain("/youtube/v3/channels?");
		expect(calledUrl).toContain("id=UC_TEST");
		expect(calledUrl).toContain("key=key123");
	});

	it("prefers the highest-resolution API thumbnail available", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				items: [
					{
						snippet: {
							thumbnails: {
								medium: { url: "https://yt3.ggpht.com/medium.jpg" },
								default: { url: "https://yt3.ggpht.com/default.jpg" },
							},
						},
					},
				],
			}),
		}));

		const url = await fetchChannelThumbnail(
			"UC_TEST",
			"key123",
			{ get: vi.fn() },
			fetchImpl,
		);

		expect(url).toBe("https://yt3.ggpht.com/medium.jpg");
	});

	it("falls back to HTML scraping when the API returns no items", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			json: async () => ({ items: [] }),
		}));
		const httpClient = {
			get: vi.fn(async () => ({
				data: '<meta property="og:image" content="https://i.ytimg.com/og.jpg">',
			})),
		};

		const url = await fetchChannelThumbnail(
			"UC_TEST",
			"key123",
			httpClient,
			fetchImpl,
		);

		expect(url).toBe("https://i.ytimg.com/og.jpg");
		expect(httpClient.get).toHaveBeenCalledTimes(1);
	});

	it("falls back to HTML scraping when the API call fails", async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error("network down");
		});
		const httpClient = {
			get: vi.fn(async () => ({
				data: '<meta property="og:image" content="https://i.ytimg.com/og.jpg">',
			})),
		};

		const url = await fetchChannelThumbnail(
			"UC_TEST",
			"key123",
			httpClient,
			fetchImpl,
		);

		expect(url).toBe("https://i.ytimg.com/og.jpg");
	});

	it("scrapes HTML only when no API key is configured", async () => {
		const fetchImpl = vi.fn();
		const httpClient = { get: vi.fn(async () => ({ data: "" })) };

		const url = await fetchChannelThumbnail("UC_TEST", "", httpClient, fetchImpl);

		expect(url).toBe(null);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(httpClient.get).toHaveBeenCalledTimes(1);
	});
});
