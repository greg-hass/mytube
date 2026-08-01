import type { RefreshFailureKind } from "../types/server";

export type RefreshFailureDetails = {
	reason: string;
	failureKind?: RefreshFailureKind;
};

export type RefreshFailureGuidance = {
	label: string;
	hint: string;
};

/**
 * Converts the server's conservative failure classification into user-facing
 * guidance. The fallback intentionally avoids diagnosing older status records
 * that predate failureKind.
 */
export function getRefreshFailureGuidance(
	failure: RefreshFailureDetails,
): RefreshFailureGuidance {
	switch (failure.failureKind) {
		case "transient":
			return {
				label: "Temporary feed problem",
				hint: "Retry this channel; cached videos remain available while the feed recovers.",
			};
		case "unavailable":
			return {
				label: "Channel unavailable",
				hint: "Check whether the channel still exists. If it does, remove and re-add the subscription if needed.",
			};
		case "restricted":
			return {
				label: "Feed access restricted",
				hint: "YouTube refused the feed request. Check the channel identity and try again later.",
			};
		case "permanent":
			return {
				label: "Feed unavailable",
				hint: "The feed did not provide usable data. Verify this subscription before retrying.",
			};
		default:
			return {
				label: "Needs review",
				hint: "Retry once, then verify this subscription if the problem continues.",
			};
	}
}
