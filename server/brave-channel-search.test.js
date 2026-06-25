import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
	searchBraveChannels,
	parseYouTubeUrl,
} = require("./brave-channel-search");

describe("Brave URL parsing", () => {
	it("parses @handle URLs", () => {
		expect(parseYouTubeUrl("https://www.youtube.com/@woodworking")).toEqual({
			type: "handle",
			value: "woodworking",
		});
	});

	it("parses /channel/ URLs", () => {
		expect(
			parseYouTubeUrl(
				"https://www.youtube.com/channel/UC1234567890123456789012",
			),
		).toEqual({
			type: "channel_id",
			value: "UC1234567890123456789012",
		});
	});

	it("parses /c/ URLs (legacy custom)", () => {
		expect(parseYouTubeUrl("https://www.youtube.com/c/woodworking")).toEqual({
			type: "custom",
			value: "woodworking",
		});
	});

	it("parses /user/ URLs (legacy)", () => {
		expect(parseYouTubeUrl("https://www.youtube.com/user/woodworker")).toEqual({
			type: "user",
			value: "woodworker",
		});
	});

	it("returns null for non-YouTube URLs", () => {
		expect(parseYouTubeUrl("https://example.com/woodworking")).toBeNull();
	});

	it("returns null for non-channel YouTube URLs", () => {
		expect(
			parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
		).toBeNull();
	});

	it("returns null for empty input", () => {
		expect(parseYouTubeUrl("")).toBeNull();
		expect(parseYouTubeUrl(null)).toBeNull();
		expect(parseYouTubeUrl(undefined)).toBeNull();
	});
});

describe("Brave channel search", () => {
	it("returns empty array when no Brave key", async () => {
		const results = await searchBraveChannels("test", {
			braveKey: undefined,
		});
		expect(results).toEqual([]);
	});

	it("returns channels with direct UC IDs without resolution", async () => {
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Woodworking Art - YouTube",
									url: "https://www.youtube.com/channel/UC3333333333333333333333",
									description: "Fine woodworking",
								},
							],
						},
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("woodworking", {
			braveKey: "brave-key",
			apiKey: "yt-key",
			fetchImpl,
		});

		expect(results).toEqual([
			{
				id: "UC3333333333333333333333",
				title: "Woodworking Art",
				description: "Fine woodworking",
				thumbnail: "",
				customUrl: undefined,
			},
		]);
	});

	it("resolves @handle results via channels.list API", async () => {
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Woodworking Art - YouTube",
									url: "https://www.youtube.com/@woodworkingart",
									description: "Woodworking tutorials",
								},
							],
						},
					}),
				};
			}
			if (urlStr.includes("googleapis.com/youtube/v3/channels")) {
				expect(urlStr).toContain("forHandle=%40woodworkingart");
				return {
					ok: true,
					status: 200,
					json: async () => ({
						items: [
							{
								id: "UC4444444444444444444444",
								snippet: {
									title: "Woodworking Art",
									description: "Fine woodworking",
									thumbnails: {
										medium: { url: "https://example.com/thumb.jpg" },
									},
								},
							},
						],
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("woodworking", {
			braveKey: "brave-key",
			apiKey: "yt-key",
			fetchImpl,
		});

		expect(results).toEqual([
			{
				id: "UC4444444444444444444444",
				title: "Woodworking Art",
				description: "Fine woodworking",
				thumbnail: "https://example.com/thumb.jpg",
				customUrl: "/@woodworkingart",
			},
		]);
	});

	it("skips handle resolution when no YouTube API key", async () => {
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Handle Channel - YouTube",
									url: "https://www.youtube.com/@handlechannel",
									description: "Test",
								},
								{
									title: "UC Channel - YouTube",
									url: "https://www.youtube.com/channel/UC5555555555555555555555",
									description: "Test",
								},
							],
						},
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("test", {
			braveKey: "brave-key",
			apiKey: undefined,
			fetchImpl,
		});

		// Only the /channel/UC... result should be returned — handles
		// can't be resolved without the YouTube API key.
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("UC5555555555555555555555");
	});

	it("deduplicates channels by ID", async () => {
		const fetchImpl = async (url) => {
			if (String(url).includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Channel A - YouTube",
									url: "https://www.youtube.com/channel/UC6666666666666666666666",
									description: "First result",
								},
								{
									title: "Channel A Again - YouTube",
									url: "https://www.youtube.com/channel/UC6666666666666666666666",
									description: "Duplicate",
								},
							],
						},
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("test", {
			braveKey: "brave-key",
			apiKey: undefined,
			fetchImpl,
		});

		expect(results).toHaveLength(1);
	});

	it("handles Brave API errors gracefully", async () => {
		const fetchImpl = async () => {
			throw new Error("Network error");
		};

		const results = await searchBraveChannels("test", {
			braveKey: "brave-key",
			fetchImpl,
		});

		expect(results).toEqual([]);
	});

	it("strips ' - YouTube' suffix from titles", async () => {
		const fetchImpl = async (url) => {
			if (String(url).includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "The Wood Whisperer - YouTube",
									url: "https://www.youtube.com/channel/UC7777777777777777777777",
									description: "Woodworking",
								},
							],
						},
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("test", {
			braveKey: "brave-key",
			fetchImpl,
		});

		expect(results[0].title).toBe("The Wood Whisperer");
	});

	it("filters out non-YouTube results from Brave", async () => {
		const fetchImpl = async (url) => {
			if (String(url).includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Woodworking - Wikipedia",
									url: "https://en.wikipedia.org/wiki/Woodworking",
									description: "Not YouTube",
								},
								{
									title: "Woodworking - YouTube",
									url: "https://www.youtube.com/channel/UC8888888888888888888888",
									description: "YouTube channel",
								},
							],
						},
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("woodworking", {
			braveKey: "brave-key",
			fetchImpl,
		});

		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("UC8888888888888888888888");
	});

	it("extracts and resizes YouTube avatar thumbnails from Brave", async () => {
		const fetchImpl = async (url) => {
			if (String(url).includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Woodworking - YouTube",
									url: "https://www.youtube.com/channel/UC9999999999999999999999",
									description: "Woodworking channel",
									thumbnail: {
										src: "https://yt3.googleusercontent.com/avatar123=s900-c-k-c0x00ffffff-no-rj",
										type: "image/jpeg",
									},
								},
							],
						},
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("woodworking", {
			braveKey: "brave-key",
			fetchImpl,
		});

		expect(results[0].thumbnail).toBe(
			"https://yt3.googleusercontent.com/avatar123=s176-c-k-c0x00ffffff-no-rj",
		);
	});

	it("passes through non-YouTube thumbnails unchanged", async () => {
		const fetchImpl = async (url) => {
			if (String(url).includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Channel - YouTube",
									url: "https://www.youtube.com/channel/UCaaaaaaaaaaaaaa00000000a",
									description: "Test",
									thumbnail: {
										src: "https://example.com/preview.jpg",
										type: "image/jpeg",
									},
								},
							],
						},
					}),
				};
			}
			return { ok: false, status: 404, json: async () => ({}) };
		};

		const results = await searchBraveChannels("test", {
			braveKey: "brave-key",
			fetchImpl,
		});

		expect(results[0].thumbnail).toBe("https://example.com/preview.jpg");
	});
});
