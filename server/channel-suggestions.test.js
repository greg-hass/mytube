import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
	buildSubscriptionContext,
	getChannelSuggestions,
} = require("./channel-suggestions");
const { clearSearchCache } = require("./channel-search");

const VERITASIUM_ID = "UCHnyfMqiRRG1u-2MsSQLbXA";

function jsonResponse(payload, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => payload,
		text: async () => JSON.stringify(payload),
	};
}

function htmlResponse(html, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => {
			throw new Error("not json");
		},
		text: async () => html,
	};
}

function llmPayload(suggestions) {
	return {
		choices: [
			{
				message: {
					content: JSON.stringify(suggestions),
				},
			},
		],
	};
}

function channelPageHtml(channelId, title) {
	return `<html><head>
		<link rel="canonical" href="https://www.youtube.com/channel/${channelId}">
		<meta property="og:title" content="${title}">
		<meta property="og:image" content="https://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj">
	</head></html>`;
}

function youtubeSearchHtml(channelId, title) {
	return `<script>var ytInitialData = ${JSON.stringify({
		contents: {
			channelRenderer: {
				channelId,
				title: { simpleText: title },
				canonicalBaseUrl: "/@somechannel",
				thumbnail: { thumbnails: [{ url: "//yt3.ggpht.com/avatar" }] },
			},
		},
	})};</script>`;
}

const SUBSCRIPTIONS = [
	{ id: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "Physics Weekly", handle: "physicsweekly" },
	{ id: "UCbbbbbbbbbbbbbbbbbbbbbb", title: "Space Today", handle: "spacetoday" },
];

describe("channel suggestions", () => {
	const originalKey = process.env.DEEPSEEK_API_KEY;

	beforeEach(() => {
		clearSearchCache();
	});

	afterEach(() => {
		if (originalKey === undefined) {
			delete process.env.DEEPSEEK_API_KEY;
		} else {
			process.env.DEEPSEEK_API_KEY = originalKey;
		}
	});

	it("builds a markdown subscription context capped at 30 entries", () => {
		const many = Array.from({ length: 40 }, (_, i) => ({
			id: `UC${String(i).padStart(22, "0")}`,
			title: `Channel ${i}`,
			handle: `handle${i}`,
		}));
		const context = buildSubscriptionContext(many);
		expect(context.split("\n")).toHaveLength(30);
		expect(context).toContain("- Channel 0 (@handle0)");
	});

	it("returns verified LLM suggestions with reasons", async () => {
		process.env.DEEPSEEK_API_KEY = "test-key";
		const fetchImpl = async (url) => {
			const href = String(url);
			if (href.includes("deepseek")) {
				return jsonResponse(
					llmPayload([
						{
							handle: "veritasium",
							title: "Veritasium",
							reason: "Great science explanations for physics fans.",
						},
					]),
				);
			}
			if (href.includes("youtube.com/@veritasium")) {
				return htmlResponse(channelPageHtml(VERITASIUM_ID, "Veritasium"));
			}
			throw new Error(`unexpected fetch: ${href}`);
		};

		const results = await getChannelSuggestions(SUBSCRIPTIONS, { fetchImpl });
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			id: VERITASIUM_ID,
			title: "Veritasium",
			reason: "Great science explanations for physics fans.",
		});
	});

	it("drops hallucinated handles that do not resolve to a channel", async () => {
		process.env.DEEPSEEK_API_KEY = "test-key";
		const fetchImpl = async (url) => {
			const href = String(url);
			if (href.includes("deepseek")) {
				return jsonResponse(
					llmPayload([
						{ handle: "nosuchchannel123", title: "Fake", reason: "x" },
						{
							handle: "veritasium",
							title: "Veritasium",
							reason: "Science.",
						},
					]),
				);
			}
			if (href.includes("youtube.com/@veritasium")) {
				return htmlResponse(channelPageHtml(VERITASIUM_ID, "Veritasium"));
			}
			if (href.includes("youtube.com/@nosuchchannel123")) {
				return htmlResponse("<html><body>404</body></html>", 404);
			}
			throw new Error(`unexpected fetch: ${href}`);
		};

		const results = await getChannelSuggestions(SUBSCRIPTIONS, { fetchImpl });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(VERITASIUM_ID);
	});

	it("falls back to title-based search when no API key is set", async () => {
		delete process.env.DEEPSEEK_API_KEY;
		const fetchImpl = async (url) => {
			const href = String(url);
			if (href.includes("youtube.com/results")) {
				return htmlResponse(
					youtubeSearchHtml(VERITASIUM_ID, "Physics Weekly Extra"),
				);
			}
			throw new Error(`unexpected fetch: ${href}`);
		};

		const results = await getChannelSuggestions(SUBSCRIPTIONS, { fetchImpl });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(VERITASIUM_ID);
		expect(results[0].reason).toBeUndefined();
	});

	it("falls back when the LLM request fails", async () => {
		process.env.DEEPSEEK_API_KEY = "test-key";
		const fetchImpl = async (url) => {
			const href = String(url);
			if (href.includes("deepseek")) {
				return jsonResponse({}, 500);
			}
			if (href.includes("youtube.com/results")) {
				return htmlResponse(
					youtubeSearchHtml(VERITASIUM_ID, "Physics Weekly Extra"),
				);
			}
			throw new Error(`unexpected fetch: ${href}`);
		};

		const results = await getChannelSuggestions(SUBSCRIPTIONS, { fetchImpl });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe(VERITASIUM_ID);
	});
});
