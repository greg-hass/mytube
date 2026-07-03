import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
	buildChannelSearchQueries,
	clearSearchCache,
	dedupeAndRankChannels,
	detectChannelIdentity,
	searchChannels,
} = require("./channel-search");
const { resetQuotaForTesting } = require("./youtube-api-search");

const CHANNEL_ID = "UCHnyfMqiRRG1u-2MsSQLbXA";

function youtubeSearchHtml() {
	return `<script>var ytInitialData = ${JSON.stringify({
		contents: {
			channelRenderer: {
				channelId: CHANNEL_ID,
				title: { simpleText: "Veritasium" },
				canonicalBaseUrl: "/@veritasium",
				thumbnail: { thumbnails: [{ url: "//yt3.ggpht.com/avatar" }] },
			},
		},
	})};</script>`;
}

describe("channel search", () => {
	beforeEach(() => {
		clearSearchCache();
		resetQuotaForTesting();
	});

	it("detects direct YouTube identities", () => {
		expect(detectChannelIdentity(CHANNEL_ID)).toEqual({
			type: "channel_id",
			value: CHANNEL_ID,
		});
		expect(detectChannelIdentity("@veritasium")).toEqual({
			type: "handle",
			value: "veritasium",
		});
		expect(
			detectChannelIdentity("https://youtube.com/@veritasium"),
		).toEqual({ type: "handle", value: "veritasium" });
	});

	it("builds meaningful query variants without stopword noise", () => {
		expect(buildChannelSearchQueries("the best woodworking channels")).toEqual(
			expect.arrayContaining(["woodworking", "woodworking channel"]),
		);
		expect(buildChannelSearchQueries("the best")).toEqual([]);
	});

	it("ranks exact matches and deduplicates by channel ID", () => {
		const results = dedupeAndRankChannels("linux tech", [
			{ id: "UC_A", title: "Cooking Tech" },
			{ id: "UC_B", title: "Linux Tech" },
			{ id: "UC_B", title: "Linux Tech duplicate" },
		]);
		expect(results.map((result) => result.id)).toEqual(["UC_B", "UC_A"]);
	});

	it("uses Feedy-style YouTube HTML discovery before the API", async () => {
		const requested = [];
		const fetchImpl = vi.fn(async (url) => {
			requested.push(String(url));
			if (String(url).includes("youtube.com/results")) {
				return new Response(youtubeSearchHtml(), { status: 200 });
			}
			throw new Error(`Unexpected request: ${url}`);
		});

		const results = await searchChannels("Veritasium", {
			fetchImpl,
			youtubeApiKey: "test-key",
		});

		expect(results[0]).toMatchObject({
			id: CHANNEL_ID,
			title: "Veritasium",
			customUrl: "/@veritasium",
		});
		expect(requested.some((url) => url.includes("googleapis.com"))).toBe(false);
	});

	it("falls back to the YouTube API when HTML discovery is empty", async () => {
		const fetchImpl = vi.fn(async (url) => {
			const value = String(url);
			if (value.includes("youtube.com/results")) {
				return new Response("<html></html>", { status: 200 });
			}
			if (value.includes("/search?")) {
				return new Response(
					JSON.stringify({
						items: [
							{
								id: { channelId: CHANNEL_ID },
								snippet: {
									title: "Veritasium",
									description: "Science",
									thumbnails: { medium: { url: "avatar" } },
								},
							},
						],
					}),
					{ status: 200 },
				);
			}
			throw new Error(`Unexpected request: ${url}`);
		});

		const results = await searchChannels("Veritasium", {
			fetchImpl,
			youtubeApiKey: "test-key",
		});

		expect(results[0]?.id).toBe(CHANNEL_ID);
		expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/search?"))).toBe(
			true,
		);
	});

	it("resolves direct handles from channel page metadata", async () => {
		const fetchImpl = vi.fn(async () =>
			new Response(
				`<link rel="canonical" href="https://youtube.com/channel/${CHANNEL_ID}"><meta property="og:title" content="Veritasium">`,
				{ status: 200 },
			),
		);

		const results = await searchChannels("@veritasium", { fetchImpl });
		expect(results[0]).toMatchObject({ id: CHANNEL_ID, title: "Veritasium" });
	});
});
