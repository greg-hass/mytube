import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
	buildYouTubeFeedUrl,
	dedupeChannelCandidates,
	extractYouTubeInitialData,
	findYouTubeChannelCandidates,
} = require("./youtube-discovery");

describe("YouTube discovery", () => {
	it("extracts balanced ytInitialData and channel renderers", () => {
		const payload = {
			contents: {
				channelRenderer: {
					channelId: "UCHnyfMqiRRG1u-2MsSQLbXA",
					title: { simpleText: "Veritasium" },
					canonicalBaseUrl: "/@veritasium",
					thumbnail: {
						thumbnails: [
							{ url: "//yt3.ggpht.com/small", width: 88 },
							{ url: "https://yt3.ggpht.com/large", width: 176 },
						],
					},
					descriptionSnippet: { runs: [{ text: "Science" }, { text: " videos" }] },
				},
			},
		};
		const html = `<script>var ytInitialData = ${JSON.stringify(payload)};</script>`;

		const data = extractYouTubeInitialData(html);
		expect(findYouTubeChannelCandidates(data)).toEqual([
			{
				id: "UCHnyfMqiRRG1u-2MsSQLbXA",
				title: "Veritasium",
				description: "Science videos",
				thumbnail: "https://yt3.ggpht.com/large",
				customUrl: "/@veritasium",
				feedUrl:
					"https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
			},
		]);
	});

	it("returns null for malformed initial data", () => {
		expect(
			extractYouTubeInitialData("<script>var ytInitialData = {broken};</script>"),
		).toBeNull();
	});

	it("deduplicates candidates by channel ID", () => {
		expect(
			dedupeChannelCandidates([
				{ id: "UC123", title: "First" },
				{ id: "UC123", title: "First duplicate", thumbnail: "avatar" },
				{ id: "UC456", title: "Second" },
			]),
		).toEqual([
			{ id: "UC123", title: "First", thumbnail: "avatar" },
			{ id: "UC456", title: "Second" },
		]);
	});

	it("builds canonical channel RSS URLs", () => {
		expect(buildYouTubeFeedUrl("UC_test-id")).toBe(
			"https://www.youtube.com/feeds/videos.xml?channel_id=UC_test-id",
		);
	});
});
