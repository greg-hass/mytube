import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
	searchYouTubeApiChannels,
	getQuotaStats,
	isQuotaAvailable,
	markQuotaExhausted,
	resetQuotaForTesting,
} = require("./youtube-api-search");

describe("YouTube API channel search", () => {
	beforeEach(() => {
		resetQuotaForTesting();
	});

	it("returns empty array when no API key is available", async () => {
		const results = await searchYouTubeApiChannels("woodworking", {
			apiKey: undefined,
		});
		expect(results).toEqual([]);
	});

	it("parses search.list channel results correctly", async () => {
		const fetchImpl = async (url) => {
			if (String(url).includes("googleapis.com/youtube/v3/search")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						items: [
							{
								id: {
									kind: "youtube#channel",
									channelId: "UC1234567890123456789012",
								},
								snippet: {
									title: "Woodworking Art",
									description: "Fine woodworking tutorials",
									thumbnails: {
										default: {
											url: "https://example.com/default.jpg",
										},
										medium: {
											url: "https://example.com/medium.jpg",
										},
									},
								},
							},
						],
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchYouTubeApiChannels("woodworking", {
			apiKey: "test-key",
			fetchImpl,
		});

		expect(results).toEqual([
			{
				id: "UC1234567890123456789012",
				title: "Woodworking Art",
				description: "Fine woodworking tutorials",
				thumbnail: "https://example.com/medium.jpg",
				customUrl: undefined,
			},
		]);
	});

	it("filters out non-channel results", async () => {
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				items: [
					{
						id: { kind: "youtube#video", videoId: "dQw4w9WgXcQ" },
						snippet: { title: "Video" },
					},
					{
						id: {
							kind: "youtube#channel",
							channelId: "UC_valid_______________",
						},
						snippet: { title: "Channel" },
					},
				],
			}),
		});

		const results = await searchYouTubeApiChannels("test", {
			apiKey: "test-key",
			fetchImpl,
		});

		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("UC_valid_______________");
	});

	it("increments quota counter per call", async () => {
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			json: async () => ({ items: [] }),
		});

		expect(getQuotaStats().searchListCallsToday).toBe(0);

		await searchYouTubeApiChannels("test", { apiKey: "key", fetchImpl });
		expect(getQuotaStats().searchListCallsToday).toBe(1);

		await searchYouTubeApiChannels("test", { apiKey: "key", fetchImpl });
		expect(getQuotaStats().searchListCallsToday).toBe(2);
	});

	it("marks quota as exhausted on 403", async () => {
		const fetchImpl = async () => ({
			ok: false,
			status: 403,
			json: async () => ({
				error: { errors: [{ reason: "quotaExceeded" }] },
			}),
		});

		const results = await searchYouTubeApiChannels("test", {
			apiKey: "key",
			fetchImpl,
		});

		expect(results).toEqual([]);
		expect(getQuotaStats().quotaExhausted).toBe(true);
	});

	it("stops searching when quota is exhausted", async () => {
		markQuotaExhausted();

		const results = await searchYouTubeApiChannels("test", {
			apiKey: "key",
			fetchImpl: async () => {
				throw new Error("should not be called");
			},
		});

		expect(results).toEqual([]);
	});

	it("reports quota as unavailable after exhaustion", () => {
		expect(isQuotaAvailable()).toBe(true);
		markQuotaExhausted();
		expect(isQuotaAvailable()).toBe(false);
	});

	it("handles network errors gracefully", async () => {
		const fetchImpl = async () => {
			throw new Error("Network error");
		};

		const results = await searchYouTubeApiChannels("test", {
			apiKey: "key",
			fetchImpl,
		});

		expect(results).toEqual([]);
	});

	it("prefers medium thumbnail over default", async () => {
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				items: [
					{
						id: { channelId: "UC1234567890123456789012" },
						snippet: {
							title: "Test",
							thumbnails: {
								default: { url: "https://example.com/default.jpg" },
								medium: { url: "https://example.com/medium.jpg" },
							},
						},
					},
				],
			}),
		});

		const results = await searchYouTubeApiChannels("test", {
			apiKey: "key",
			fetchImpl,
		});

		expect(results[0].thumbnail).toBe("https://example.com/medium.jpg");
	});

	it("falls back to default thumbnail when medium is missing", async () => {
		const fetchImpl = async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				items: [
					{
						id: { channelId: "UC1234567890123456789012" },
						snippet: {
							title: "Test",
							thumbnails: {
								default: { url: "https://example.com/default.jpg" },
							},
						},
					},
				],
			}),
		});

		const results = await searchYouTubeApiChannels("test", {
			apiKey: "key",
			fetchImpl,
		});

		expect(results[0].thumbnail).toBe("https://example.com/default.jpg");
	});
});
