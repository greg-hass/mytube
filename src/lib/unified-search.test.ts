import { describe, expect, it } from "vitest";
import {
	buildUnifiedSearchResults,
	SEARCH_SCOPE_OPTIONS,
	type UnifiedSearchSources,
} from "./unified-search";

const sources: UnifiedSearchSources = {
	channels: [
		{
			id: "UC_BETA",
			title: "Beta Tech",
			description: "Hardware reviews",
			thumbnail: "",
			customUrl: "@betatech",
		},
		{
			id: "UC_ALPHA",
			title: "Alpha Science",
			description: "Space news",
			thumbnail: "",
		},
	],
	favoriteChannels: [
		{
			id: "UC_ALPHA",
			title: "Alpha Science",
			description: "Space news",
			thumbnail: "",
			isFavorite: true,
		},
	],
	videos: [
		{
			id: "video-old",
			title: "Old hardware guide",
			description: "",
			thumbnail: "",
			channelId: "UC_BETA",
			channelTitle: "Beta Tech",
			publishedAt: "2026-05-01T00:00:00.000Z",
		},
		{
			id: "video-new",
			title: "New hardware guide",
			description: "",
			thumbnail: "",
			channelId: "UC_BETA",
			channelTitle: "Beta Tech",
			publishedAt: "2026-05-02T00:00:00.000Z",
		},
	],
	favoriteVideos: [
		{
			id: "saved-video",
			title: "Saved space documentary",
			description: "",
			thumbnail: "",
			channelId: "UC_ALPHA",
			channelTitle: "Alpha Science",
			publishedAt: "2026-04-30T00:00:00.000Z",
		},
	],
};

describe("buildUnifiedSearchResults", () => {
	it("searches channel identity and video metadata across all sources", () => {
		const results = buildUnifiedSearchResults("@betatech", sources);

		expect(results.allChannels.map(({ id }) => id)).toEqual(["UC_BETA"]);
		expect(results.allVideos).toEqual([]);

		const descriptionResults = buildUnifiedSearchResults("space", sources);
		expect(descriptionResults.allChannels.map(({ id }) => id)).toEqual([
			"UC_ALPHA",
		]);
		expect(descriptionResults.allVideos.map(({ id }) => id)).toEqual([
			"saved-video",
		]);
	});

	it("includes saved-only favourites and removes duplicate source records", () => {
		const results = buildUnifiedSearchResults("alpha", sources);

		expect(results.allChannels.map(({ id }) => id)).toEqual(["UC_ALPHA"]);
		expect(results.favoriteChannels.map(({ id }) => id)).toEqual(["UC_ALPHA"]);
		expect(results.allVideos.map(({ id }) => id)).toEqual(["saved-video"]);
		expect(results.favoriteVideos.map(({ id }) => id)).toEqual(["saved-video"]);
	});

	it("keeps video results newest first and exposes stable scope labels", () => {
		const results = buildUnifiedSearchResults("hardware", sources);

		expect(results.allVideos.map(({ id }) => id)).toEqual([
			"video-new",
			"video-old",
		]);
		expect(SEARCH_SCOPE_OPTIONS.map(({ value }) => value)).toEqual([
			"all",
			"videos",
			"channels",
			"favorites",
		]);
	});

	it("returns no matches for an empty query", () => {
		expect(
			buildUnifiedSearchResults("  ", sources),
		).toEqual({
			allVideos: [],
			allChannels: [],
			favoriteVideos: [],
			favoriteChannels: [],
		});
	});
});
