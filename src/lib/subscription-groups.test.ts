import { describe, expect, it } from "vitest";
import {
	readSubscriptionGroups,
	writeSubscriptionGroups,
} from "./subscription-groups";

describe("subscription groups storage", () => {
	it("normalizes persisted group names", () => {
		const storage = new Map<string, string>([
			[
				"subscription-groups",
				JSON.stringify([" Tech ", "Personal", "Tech", "", 42, null]),
			],
		]);

		expect(
			readSubscriptionGroups({
				getItem: (key) => storage.get(key) ?? null,
			}),
		).toEqual(["Personal", "Tech"]);
	});

	it("returns an empty list for missing or malformed data", () => {
		const storage = new Map<string, string>([["subscription-groups", "{"]]);

		expect(
			readSubscriptionGroups({
				getItem: (key) => storage.get(key) ?? null,
			}),
		).toEqual([]);
	});

	it("writes normalized group names", () => {
		const storage = new Map<string, string>();

		const groups = writeSubscriptionGroups([" Tech ", "Personal", "Tech"], {
			setItem: (key, value) => storage.set(key, value),
		});

		expect(groups).toEqual(["Personal", "Tech"]);
		expect(JSON.parse(storage.get("subscription-groups") || "[]")).toEqual([
			"Personal",
			"Tech",
		]);
	});
});
