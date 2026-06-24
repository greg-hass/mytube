import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { mergeVideoArchive } = require("./video-archive");

describe("mergeVideoArchive", () => {
	it("preserves older cached videos while adding newly fetched RSS videos", () => {
		const existingVideos = [
			{
				id: "older-video",
				title: "Older cached video",
				channelId: "UC1",
				channelTitle: "Channel One",
				publishedAt: "2026-04-01T10:00:00.000Z",
				thumbnail: "older.jpg",
				description: "",
			},
		];
		const fetchedVideos = [
			{
				id: "new-video",
				title: "New RSS video",
				channelId: "UC1",
				channelTitle: "Channel One",
				publishedAt: "2026-05-04T10:00:00.000Z",
				thumbnail: "new.jpg",
				description: "",
			},
		];

		const { videos } = mergeVideoArchive(existingVideos, fetchedVideos, {
			activeChannelIds: new Set(["UC1"]),
			maxVideos: 10,
		});

		expect(videos.map((video) => video.id)).toEqual([
			"new-video",
			"older-video",
		]);
	});

	it("normalizes cached YouTube thumbnails to max resolution when preserving archived videos", () => {
		const { videos } = mergeVideoArchive(
			[
				{
					id: "cached-video",
					title: "Cached video",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-01T10:00:00.000Z",
					thumbnail: "https://i.ytimg.com/vi/cached-video/hqdefault.jpg",
					description: "",
				},
			],
			[],
			{
				activeChannelIds: new Set(["UC1"]),
				maxVideos: 10,
			},
		);

		expect(videos[0].thumbnail).toBe(
			"https://i.ytimg.com/vi/cached-video/maxresdefault.jpg",
		);
	});

	it("normalizes sharded ytimg hosts to max resolution when preserving archived videos", () => {
		const { videos } = mergeVideoArchive(
			[
				{
					id: "cached-video",
					title: "Cached video",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-01T10:00:00.000Z",
					thumbnail: "https://i3.ytimg.com/vi/cached-video/hqdefault.jpg",
					description: "",
				},
			],
			[],
			{
				activeChannelIds: new Set(["UC1"]),
				maxVideos: 10,
			},
		);

		expect(videos[0].thumbnail).toBe(
			"https://i3.ytimg.com/vi/cached-video/maxresdefault.jpg",
		);
	});

	it("normalizes cached Shorts thumbnails to the portrait max-resolution source", () => {
		const { videos } = mergeVideoArchive(
			[
				{
					id: "cached-short",
					title: "Cached short #shorts",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-01T10:00:00.000Z",
					thumbnail: "https://i.ytimg.com/vi/cached-short/hqdefault.jpg",
					description: "",
				},
			],
			[],
			{
				activeChannelIds: new Set(["UC1"]),
				maxVideos: 10,
			},
		);

		expect(videos[0]).toMatchObject({
			isShort: true,
			thumbnail: "https://i.ytimg.com/vi/cached-short/oar2.jpg",
		});
	});

	it("marks cached portrait YouTube thumbnails as Shorts so the Latest filter can hide them", () => {
		const { videos } = mergeVideoArchive(
			[
				{
					id: "cached-portrait-short",
					title: "Cached vertical clip",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-01T10:00:00.000Z",
					thumbnail: "https://i.ytimg.com/vi/cached-portrait-short/oar2.jpg",
					description: "",
				},
			],
			[],
			{
				activeChannelIds: new Set(["UC1"]),
				maxVideos: 10,
			},
		);

		expect(videos[0]).toMatchObject({
			isShort: true,
			thumbnail: "https://i.ytimg.com/vi/cached-portrait-short/oar2.jpg",
		});
	});

	it("drops archived videos for channels that are no longer subscribed", () => {
		const { videos } = mergeVideoArchive(
			[
				{
					id: "removed-channel-video",
					title: "Should disappear",
					channelId: "UC_REMOVED",
					channelTitle: "Removed",
					publishedAt: "2026-05-01T10:00:00.000Z",
					thumbnail: "removed.jpg",
					description: "",
				},
			],
			[],
			{
				activeChannelIds: new Set(["UC_ACTIVE"]),
				maxVideos: 10,
			},
		);

		expect(videos).toEqual([]);
	});

	it("keeps the original publish time when uploads fallback re-finds an archived video", () => {
		const { videos } = mergeVideoArchive(
			[
				{
					id: "existing-video",
					title: "Existing title",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-01T10:00:00.000Z",
					thumbnail: "old.jpg",
					description: "Existing description",
				},
			],
			[
				{
					id: "existing-video",
					title: "Fallback title",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-14T12:00:00.000Z",
					thumbnail: "new.jpg",
					description: "",
					fetchedVia: "youtube-page-fallback",
				},
			],
			{
				activeChannelIds: new Set(["UC1"]),
				maxVideos: 10,
			},
		);

		expect(videos[0]).toMatchObject({
			id: "existing-video",
			title: "Fallback title",
			publishedAt: "2026-05-01T10:00:00.000Z",
			thumbnail: "new.jpg",
			description: "Existing description",
		});
	});

	it("drops old uploads fallback entries that were stamped with the cache write time", () => {
		const { videos } = mergeVideoArchive(
			[
				{
					id: "poisoned-fallback",
					title: "Fallback video without a real publish time",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-14T12:00:03.000Z",
					thumbnail: "fallback.jpg",
					description: "",
					fetchedVia: "youtube-page-fallback",
				},
				{
					id: "real-fallback",
					title: "Fallback video with a parsed publish time",
					channelId: "UC1",
					channelTitle: "Channel One",
					publishedAt: "2026-05-14T10:00:00.000Z",
					thumbnail: "fallback.jpg",
					description: "",
					fetchedVia: "youtube-page-fallback",
					publishedAtSource: "youtube-relative-time",
				},
			],
			[],
			{
				activeChannelIds: new Set(["UC1"]),
				cacheUpdatedAt: "2026-05-14T12:00:00.000Z",
				maxVideos: 10,
			},
		);

		expect(videos.map((video) => video.id)).toEqual(["real-fallback"]);
	});

	it("reports evictedCount when the cap drops oldest videos", () => {
		const existing = Array.from({ length: 8 }, (_, i) => ({
			id: `old-${i}`,
			channelId: "UC1",
			publishedAt: `2026-01-0${i + 1}T10:00:00.000Z`,
			thumbnail: "thumb.jpg",
			description: "",
		}));
		const fetched = [
			{
				id: "new-0",
				channelId: "UC1",
				publishedAt: "2026-06-01T10:00:00.000Z",
				thumbnail: "thumb.jpg",
				description: "",
			},
		];

		const { videos, evictedCount } = mergeVideoArchive(existing, fetched, {
			activeChannelIds: new Set(["UC1"]),
			maxVideos: 5,
		});

		expect(videos).toHaveLength(5);
		expect(evictedCount).toBe(4);
		// Newest video is kept
		expect(videos[0].id).toBe("new-0");
	});

	it("reports zero evictedCount when under the cap", () => {
		const { videos, evictedCount } = mergeVideoArchive(
			[
				{
					id: "v1",
					channelId: "UC1",
					publishedAt: "2026-06-01T10:00:00.000Z",
					thumbnail: "",
					description: "",
				},
			],
			[],
			{ activeChannelIds: new Set(["UC1"]), maxVideos: 10 },
		);

		expect(videos).toHaveLength(1);
		expect(evictedCount).toBe(0);
	});
});
