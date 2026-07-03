import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
	buildVideoFromFeedItem,
	classifyFeedFailure,
	createVideoItemHash,
	fetchChannelFeed,
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
			parseURL: vi.fn(async () => ({
				title: "Channel",
				items: [{ id: "yt:video:a", title: "A" }],
			})),
		};
		const itemHash = createVideoItemHash([{ id: "a" }]);

		await expect(
			fetchChannelFeed("UC_TEST", feedParser, { previousItemHash: itemHash }),
		).resolves.toMatchObject({
			outcome: "not-modified",
			itemHash,
			source: "rss",
			videos: [],
		});
		expect(feedParser.parseURL).toHaveBeenCalledTimes(1);
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
			parseURL: vi.fn(async () => {
				throw Object.assign(new Error("upstream unavailable"), {
					statusCode: 503,
				});
			}),
		};
		const youtubeApiFallback = vi.fn(async () => ({
			videos: [{ id: "api-video", channelId: "UC_TEST" }],
			channelMetadata: { title: "Channel", thumbnail: null },
		}));

		await expect(
			fetchChannelFeed("UC_TEST", feedParser, {
				youtubeApiFallback,
			}),
		).resolves.toMatchObject({
			outcome: "success",
			source: "youtube-api",
			videos: [{ id: "api-video", channelId: "UC_TEST" }],
		});
		expect(feedParser.parseURL).toHaveBeenCalledTimes(1);
		expect(youtubeApiFallback).toHaveBeenCalledTimes(1);
	});

	it("preserves a classified failure when no API fallback is available", async () => {
		const feedParser = {
			parseURL: vi.fn(async () => {
				throw Object.assign(new Error("missing"), { statusCode: 404 });
			}),
		};

		await expect(fetchChannelFeed("UC_TEST", feedParser)).resolves.toMatchObject({
			outcome: "permanent-failure",
			videos: [],
			errorStatus: 404,
			errorMessage: "missing",
		});
		expect(feedParser.parseURL).toHaveBeenCalledTimes(1);
	});
});
