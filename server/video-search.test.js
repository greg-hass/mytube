import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
	searchVideos,
	extractSearchVideos,
	parseSearchVideoRenderer,
	titleMatchesQuery,
	clearVideoSearchCache,
} = require("./video-search");

const NOW = new Date("2026-08-19T12:00:00Z").getTime();

function buildResultsHtml(renderers) {
	const initialData = {
		contents: {
			twoColumnSearchResultsRenderer: {
				primaryContents: {
					sectionListRenderer: {
						contents: [
							{
								itemSectionRenderer: {
									contents: renderers.map((renderer) => ({
										videoRenderer: renderer,
									})),
								},
							},
						],
					},
				},
			},
		},
	};
	return `<html><body><script>var ytInitialData = ${JSON.stringify(initialData)};</script></body></html>`;
}

function buildVideoRenderer(overrides = {}) {
	return {
		videoId: overrides.videoId || "abc123",
		title: { runs: [{ text: overrides.title || "Woodworking Basics" }] },
		ownerText: {
			runs: [
				{
					text: overrides.channelTitle || "Wood Shop",
					navigationEndpoint: {
						browseEndpoint: {
							browseId: overrides.channelId || "UCwoodshop123",
						},
					},
				},
			],
		},
		publishedTimeText: {
			simpleText: overrides.publishedTimeText || "2 days ago",
		},
		lengthText: { simpleText: overrides.lengthText || "10:31" },
		descriptionSnippet: {
			runs: [{ text: overrides.description || "A description" }],
		},
		thumbnail: {
			thumbnails: [{ url: "https://i.ytimg.com/vi/abc123/hq720.jpg" }],
		},
		...overrides.extra,
	};
}

function okJson(html) {
	return {
		ok: true,
		status: 200,
		text: async () => html,
	};
}

describe("video-search", () => {
	afterEach(() => {
		clearVideoSearchCache();
	});

	describe("searchVideos", () => {
		it("returns parsed videos for a matching query", async () => {
			const html = buildResultsHtml([
				buildVideoRenderer({
					videoId: "vid1",
					title: "Woodworking joinery explained",
				}),
			]);
			const fetchImpl = vi.fn().mockResolvedValue(okJson(html));

			const { results, source } = await searchVideos("woodworking", {
				fetchImpl,
				now: NOW,
			});

			expect(source).toBe("scrape");
			expect(results).toHaveLength(1);
			expect(results[0]).toMatchObject({
				id: "vid1",
				title: "Woodworking joinery explained",
				channelId: "UCwoodshop123",
				channelTitle: "Wood Shop",
				duration: 631,
				isShort: false,
			});
			expect(fetchImpl).toHaveBeenCalledTimes(1);
			const url = new URL(fetchImpl.mock.calls[0][0]);
			expect(url.searchParams.get("search_query")).toBe("intitle:woodworking");
			expect(url.searchParams.get("sp")).toBe("CAISAhAB");
		});

		it("serves repeated queries from cache", async () => {
			const html = buildResultsHtml([
				buildVideoRenderer({ videoId: "cached1", title: "Joinery basics" }),
			]);
			const fetchImpl = vi.fn().mockResolvedValue(okJson(html));

			await searchVideos("joinery", { fetchImpl, now: NOW });
			const second = await searchVideos("joinery", { fetchImpl, now: NOW });

			expect(fetchImpl).toHaveBeenCalledTimes(1);
			expect(second.source).toBe("cache");
			expect(second.results[0].id).toBe("cached1");
		});

		it("rejects queries shorter than 2 characters without fetching", async () => {
			const fetchImpl = vi.fn();
			const { results } = await searchVideos("w", { fetchImpl });
			expect(results).toEqual([]);
			expect(fetchImpl).not.toHaveBeenCalled();
		});

		it("drops videos whose title misses a query token", async () => {
			const html = buildResultsHtml([
				buildVideoRenderer({
					videoId: "matching",
					title: "Dovetail joinery demo",
				}),
				buildVideoRenderer({
					videoId: "offtopic",
					title: "Shop tour 2026",
				}),
			]);
			const fetchImpl = vi.fn().mockResolvedValue(okJson(html));

			const { results } = await searchVideos("dovetail joinery", {
				fetchImpl,
				now: NOW,
			});

			expect(results.map((video) => video.id)).toEqual(["matching"]);
		});

		it("returns empty results on non-OK responses", async () => {
			const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429 });
			const { results } = await searchVideos("anything", { fetchImpl });
			expect(results).toEqual([]);
		});

		it("returns empty results when the page has no ytInitialData", async () => {
			const fetchImpl = vi
				.fn()
				.mockResolvedValue(okJson("<html>no data here</html>"));
			const { results } = await searchVideos("anything", { fetchImpl });
			expect(results).toEqual([]);
		});

		it("swallows fetch errors", async () => {
			const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));
			const { results } = await searchVideos("anything", { fetchImpl });
			expect(results).toEqual([]);
		});

		it("respects the limit option", async () => {
			const renderers = Array.from({ length: 5 }, (_, i) =>
				buildVideoRenderer({ videoId: `v${i}`, title: "Sourdough tips" }),
			);
			const fetchImpl = vi
				.fn()
				.mockResolvedValue(okJson(buildResultsHtml(renderers)));

			const { results } = await searchVideos("sourdough", {
				fetchImpl,
				limit: 3,
				now: NOW,
			});
			expect(results).toHaveLength(3);
		});

		it("normalizes whitespace in queries for the cache key", async () => {
			const html = buildResultsHtml([
				buildVideoRenderer({ videoId: "norm1", title: "Sourdough tips" }),
			]);
			const fetchImpl = vi.fn().mockResolvedValue(okJson(html));

			await searchVideos("sourdough  tips", { fetchImpl, now: NOW });
			const second = await searchVideos("sourdough tips", {
				fetchImpl,
				now: NOW,
			});

			expect(second.source).toBe("cache");
		});
	});

	describe("parseSearchVideoRenderer", () => {
		it("marks short videos", () => {
			const video = parseSearchVideoRenderer(
				buildVideoRenderer({ lengthText: "0:58" }),
				{ now: NOW },
			);
			expect(video.isShort).toBe(true);
			expect(video.duration).toBe(58);
		});

		it("rejects renderers without a UC channel id", () => {
			const video = parseSearchVideoRenderer(
				buildVideoRenderer({ channelId: "not-a-channel" }),
				{ now: NOW },
			);
			expect(video).toBeNull();
		});

		it("rejects renderers without a parseable published time", () => {
			const video = parseSearchVideoRenderer(
				buildVideoRenderer({ publishedTimeText: { simpleText: "soon" } }),
				{ now: NOW },
			);
			expect(video).toBeNull();
		});
	});

	describe("titleMatchesQuery", () => {
		it("is case-insensitive across tokens", () => {
			expect(titleMatchesQuery("Dovetail JOINERY Demo", "dovetail joinery")).toBe(
				true,
			);
		});
		it("fails when any token is missing", () => {
			expect(titleMatchesQuery("Dovetail Demo", "dovetail joinery")).toBe(false);
		});
	});

	describe("extractSearchVideos", () => {
		it("dedupes repeated video ids", () => {
			const renderer = buildVideoRenderer({ videoId: "dupe", title: "Welding" });
			const initialData = {
				contents: [
					{ videoRenderer: renderer },
					{ videoRenderer: { ...renderer } },
					{ videoRenderer: renderer },
				],
			};
			const videos = extractSearchVideos(initialData, "welding", {
				limit: 10,
			});
			expect(videos).toHaveLength(1);
		});
	});
});
