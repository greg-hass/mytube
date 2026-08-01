import { describe, expect, it } from "vitest";
import {
	buildChannelIdentitySet,
	hasChannelIdentity,
	getChannelIdentityKeys,
} from "./channel-identity";

describe("channel identity", () => {
	it("matches temporary handle subscriptions to canonical handle results", () => {
		const known = buildChannelIdentitySet([
			{ id: "handle_Veritasium", customUrl: undefined },
		]);

		expect(
			hasChannelIdentity(
				{ id: "UC1234567890123456789012", customUrl: "/@veritasium" },
				known,
			),
		).toBe(true);
	});

	it("normalizes equivalent custom URL forms", () => {
		const known = buildChannelIdentitySet([
			{ id: "custom_woodworking", customUrl: "woodworking" },
		]);

		expect(
			hasChannelIdentity(
				{
					id: "UC1234567890123456789012",
					customUrl: "https://www.youtube.com/c/woodworking",
				},
				known,
			),
		).toBe(true);
	});

	it("does not use channel titles as identity", () => {
		const known = buildChannelIdentitySet([
			{ id: "UC1111111111111111111111", customUrl: undefined },
		]);

		expect(
			hasChannelIdentity(
				{ id: "UC2222222222222222222222", customUrl: undefined },
				known,
			),
		).toBe(false);
	});

	it("keeps canonical IDs as exact identities", () => {
		expect(
			getChannelIdentityKeys({
				id: "UC1234567890123456789012",
				customUrl: "/@channel",
			}),
		).toEqual(["id:UC1234567890123456789012", "handle:channel"]);
	});
});
