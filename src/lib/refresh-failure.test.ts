import { describe, expect, it } from "vitest";
import { getRefreshFailureGuidance } from "./refresh-failure";

describe("getRefreshFailureGuidance", () => {
	it.each([
		[
			"transient",
			"Temporary feed problem",
			/Retry this channel; cached videos remain available/,
		],
		[
			"unavailable",
			"Channel unavailable",
			/Check whether the channel still exists/,
		],
		[
			"restricted",
			"Feed access restricted",
			/YouTube refused the feed request/,
		],
		[
			"permanent",
			"Feed unavailable",
			/Verify this subscription before retrying/,
		],
	] as const)("explains %s failures", (failureKind, label, hint) => {
		const guidance = getRefreshFailureGuidance({
			reason: "RSS feed failed",
			failureKind,
		});

		expect(guidance).toEqual({ label, hint: expect.stringMatching(hint) });
	});

	it("keeps legacy or unknown failures conservative", () => {
		expect(
			getRefreshFailureGuidance({ reason: "No usable feed data" }),
		).toEqual({
			label: "Needs review",
			hint: "Retry once, then verify this subscription if the problem continues.",
		});
	});
});
