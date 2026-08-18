import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { decodeHtmlEntities } = require("./html-entities");

describe("decodeHtmlEntities", () => {
	it("decodes named and numeric entities", () => {
		expect(decodeHtmlEntities("Doesn&#39;t &amp; &#x1F3B8;")).toBe(
			"Doesn't & 🎸",
		);
	});
});
