import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./html-entities";

describe("decodeHtmlEntities", () => {
	it("decodes common named and numeric entities", () => {
		expect(
			decodeHtmlEntities(
				"Fox News Doesn&#39;t Support The Troops &amp; Viewers &quot;Any More&quot;",
			),
		).toBe('Fox News Doesn\'t Support The Troops & Viewers "Any More"');
	});

	it("decodes hexadecimal entities and preserves unknown entities", () => {
		expect(decodeHtmlEntities("Rock &#x26; Roll &#x1F3B8; &unknown; ")).toBe(
			"Rock & Roll 🎸 &unknown; ",
		);
	});
});
