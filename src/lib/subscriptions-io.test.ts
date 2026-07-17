import { describe, expect, it } from "vitest";
import type { YouTubeChannel } from "../types/youtube";
import { filterAndSortChannels, toYouTubeChannels } from "./subscriptions-io";

function channel(
	id: string,
	title: string,
	addedAt?: number,
): YouTubeChannel {
	return {
		id,
		title,
		description: "",
		thumbnail: "",
		addedAt,
	};
}

describe("subscription sorting", () => {
	const channels = [
		channel("UC_A", "Alpha", 200),
		channel("UC_B", "Beta", 100),
		channel("UC_C", "Gamma"),
	];

	it("sorts by title for the A-Z option", () => {
		expect(filterAndSortChannels(channels, "", "name").map((item) => item.title))
			.toEqual(["Alpha", "Beta", "Gamma"]);
	});

	it("sorts newest subscriptions first and keeps legacy rows last", () => {
		expect(
			filterAndSortChannels(channels, "", "recent").map(
				(item) => item.title,
			),
		).toEqual(["Alpha", "Beta", "Gamma"]);
	});

	it("sorts oldest subscriptions first and keeps legacy rows last", () => {
		expect(
			filterAndSortChannels(channels, "", "oldest").map(
				(item) => item.title,
			),
		).toEqual(["Beta", "Alpha", "Gamma"]);
	});

	it("preserves addedAt when converting stored subscriptions", () => {
		expect(
			toYouTubeChannels([
				{
					id: "UC1234567890123456789012",
					title: "Channel",
					addedAt: 123,
				},
			])[0].addedAt,
		).toBe(123);
	});
});
