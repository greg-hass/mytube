import { describe, expect, it } from "vitest";
import { getRecentChannelActivity } from "./channel-activity";
import type { YouTubeChannel, YouTubeVideo } from "../types/youtube";

const NOW = Date.parse("2026-08-01T12:00:00.000Z");

function channel(id: string, title: string): YouTubeChannel {
	return { id, title, description: "", thumbnail: "" };
}

function video(
	id: string,
	channelId: string,
	publishedAt: string,
): YouTubeVideo {
	return {
		id,
		title: id,
		description: "",
		thumbnail: "",
		channelId,
		channelTitle: channelId,
		publishedAt,
	};
}

describe("recent channel activity", () => {
	it("counts only subscribed uploads in the seven-day window", () => {
		const result = getRecentChannelActivity(
			[
				video("a-new", "UC_A", "2026-08-01T10:00:00.000Z"),
				video("a-old", "UC_A", "2026-07-24T11:59:59.000Z"),
				video("unsubscribed", "UC_UNKNOWN", "2026-08-01T09:00:00.000Z"),
				video("future", "UC_A", "2026-08-01T13:00:00.000Z"),
			],
			[channel("UC_A", "Alpha")],
			NOW,
		);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ count: 1, channel: { title: "Alpha" } });
	});

	it("orders by upload count, then latest upload, then title", () => {
		const result = getRecentChannelActivity(
			[
				video("b-1", "UC_B", "2026-08-01T11:00:00.000Z"),
				video("a-1", "UC_A", "2026-08-01T09:00:00.000Z"),
				video("a-2", "UC_A", "2026-07-31T09:00:00.000Z"),
				video("c-1", "UC_C", "2026-08-01T11:00:00.000Z"),
			],
			[
				channel("UC_B", "Beta"),
				channel("UC_A", "Alpha"),
				channel("UC_C", "Charlie"),
			],
			NOW,
		);

		expect(result.map((item) => item.channel.title)).toEqual([
			"Alpha",
			"Beta",
			"Charlie",
		]);
	});
});
