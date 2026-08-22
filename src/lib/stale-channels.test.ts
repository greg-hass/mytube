import { describe, expect, it } from "vitest";
import {
	computeLastUploadByChannel,
	countChannelsWithoutUploadData,
	filterStaleChannels,
	isStaleChannel,
} from "./stale-channels";
import type { YouTubeChannel, YouTubeVideo } from "../types/youtube";

const NOW = new Date("2026-08-20T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

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
		channelTitle: "Channel",
		publishedAt,
	};
}

function channel(id: string): YouTubeChannel {
	return { id, title: id, description: "", thumbnail: "" };
}

describe("stale-channels", () => {
	describe("computeLastUploadByChannel", () => {
		it("keeps the newest publishedAt per channel", () => {
			const map = computeLastUploadByChannel([
				video("a", "UC1", "2026-01-01T00:00:00Z"),
				video("b", "UC1", "2026-06-01T00:00:00Z"),
				video("c", "UC2", "2026-07-01T00:00:00Z"),
			]);

			expect(map.get("UC1")).toBe("2026-06-01T00:00:00Z");
			expect(map.get("UC2")).toBe("2026-07-01T00:00:00Z");
			expect(map.size).toBe(2);
		});

		it("skips entries without channelId or publishedAt", () => {
			const map = computeLastUploadByChannel([
				{ ...video("a", "UC1", ""), publishedAt: "" },
				{ ...video("b", "", "2026-06-01T00:00:00Z") },
			]);
			expect(map.size).toBe(0);
		});
	});

	describe("isStaleChannel", () => {
		it("marks channels past the threshold stale", () => {
			const ninetyOneDaysAgo = new Date(NOW - 91 * DAY).toISOString();
			expect(isStaleChannel(ninetyOneDaysAgo, 90, NOW)).toBe(true);
		});

		it("keeps recent channels fresh", () => {
			const yesterday = new Date(NOW - DAY).toISOString();
			expect(isStaleChannel(yesterday, 90, NOW)).toBe(false);
		});

		it("treats missing or invalid data as not stale", () => {
			expect(isStaleChannel(undefined, 90, NOW)).toBe(false);
			expect(isStaleChannel("not-a-date", 90, NOW)).toBe(false);
		});
	});

	describe("filterStaleChannels", () => {
		it("returns only stale channels, stalest first", () => {
			const lastUpload = new Map([
				["UCfresh", new Date(NOW - 2 * DAY).toISOString()],
				["UColder", new Date(NOW - 200 * DAY).toISOString()],
				["UCstale", new Date(NOW - 100 * DAY).toISOString()],
				["UCunknown", ""], // never happens — map holds valid dates only
			]);
			lastUpload.delete("UCunknown");
			lastUpload.set("UCnodata", undefined as unknown as string);

			const result = filterStaleChannels(
				[
					channel("UCfresh"),
					channel("UColder"),
					channel("UCstale"),
					channel("UCnodata"),
				],
				lastUpload,
				90,
				NOW,
			);

			expect(result.map((c) => c.id)).toEqual(["UColder", "UCstale"]);
		});
	});

	describe("countChannelsWithoutUploadData", () => {
		it("counts subscribed channels absent from the archive", () => {
			const lastUpload = new Map([["UC1", "2026-06-01T00:00:00Z"]]);
			expect(
				countChannelsWithoutUploadData(
					[channel("UC1"), channel("UC2"), channel("UC3")],
					lastUpload,
				),
			).toBe(2);
		});
	});
});
