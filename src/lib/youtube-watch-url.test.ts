import { describe, expect, it } from "vitest";
import { buildYouTubeWatchUrl } from "./youtube-watch-url";

describe("YouTube watch URLs", () => {
	it("includes a whole-second resume timestamp", () => {
		expect(buildYouTubeWatchUrl("abc123XYZ_-", 74.9)).toBe(
			"https://www.youtube.com/watch?v=abc123XYZ_-&t=74s",
		);
	});

	it.each([undefined, 0, -12, Number.NaN, Number.POSITIVE_INFINITY])(
		"omits invalid or non-resumable timestamp %s",
		(startSeconds) => {
			expect(buildYouTubeWatchUrl("abc123XYZ_-", startSeconds)).toBe(
				"https://www.youtube.com/watch?v=abc123XYZ_-",
			);
		},
	);

	it("encodes the supplied video identifier as a query value", () => {
		expect(buildYouTubeWatchUrl("video id&next=bad")).toBe(
			"https://www.youtube.com/watch?v=video+id%26next%3Dbad",
		);
	});
});
