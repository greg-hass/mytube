import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
	buildChannelSearchQueries,
	clearSearchCache,
	dedupeAndRankChannels,
	detectChannelIdentity,
	getSearchCacheStats,
	parseYouTubeChannelSearchResults,
	scoreChannelResult,
	searchChannels,
} = require("./channel-search");

describe("channel search ranking", () => {
	it("builds query variants prioritizing the meaningful phrase", () => {
		// No stopwords in "Level One Techs" → all tokens are meaningful.
		// The meaningful phrase and its variants come first; abbreviations
		// are kept as lower-priority fallbacks.
		expect(buildChannelSearchQueries("Level One Techs")).toEqual([
			"level one techs",
			"level one techs channel",
			"levelonetechs",
			"levelt",
			"@levelt",
		]);
	});

	it("prioritizes the meaningful token for natural language queries", () => {
		// "the best woodworking channels" → meaningful token "woodworking".
		// The meaningful token and its "channel" variant come first; the
		// original phrase is kept as a full-text fallback.
		const queries = buildChannelSearchQueries("the best woodworking channels");

		expect(queries[0]).toBe("woodworking");
		expect(queries).toContain("woodworking channel");
		// No stopword-based abbreviations.
		expect(queries).not.toContain("thec");
		expect(queries).not.toContain("@thec");
		expect(queries).not.toContain("tbtwc");
		// Original phrase kept for full-text matching.
		expect(queries).toContain("the best woodworking channels");
	});

	it("returns an empty query list when the input is only stopwords", () => {
		// "the best" carries no meaningful terms — returning queries built from
		// stopwords would just spam the backends with junk. Empty list lets the
		// frontend surface "no channels found" instead of misleading results.
		expect(buildChannelSearchQueries("the best")).toEqual([]);
		expect(buildChannelSearchQueries("channels")).toEqual([]);
	});

	it("prioritizes meaningful multi-token phrases over abbreviations", () => {
		// "best tech review channels" → meaningful tokens ["tech", "review"]
		// → meaningful phrase "tech review" first, abbreviation "techr" later.
		const queries = buildChannelSearchQueries("best tech review channels");

		expect(queries).not.toContain("btrc");
		expect(queries[0]).toBe("tech review");
		expect(queries).toContain("tech review channel");
		expect(queries).toContain("techr");
		expect(queries).toContain("best tech review channels");
	});

	it("ranks exact and token matches above weak matches", () => {
		const results = dedupeAndRankChannels("linux tech", [
			{ id: "UC_WEAK________________", title: "Cooking Tech" },
			{ id: "UC_EXACT_______________", title: "Linux Tech" },
			{ id: "UC_TOKEN_______________", title: "Linux News and Tutorials" },
		]);

		expect(results.map((result) => result.title)).toEqual([
			"Linux Tech",
			"Linux News and Tutorials",
			"Cooking Tech",
		]);
	});

	it("ignores non-channel ids and unmatchable results", () => {
		const results = dedupeAndRankChannels("linux", [
			{ id: "video-id", title: "Linux Video" },
			{ id: "UC_VALID______________", title: "Linux Channel" },
			{ id: "UC_OTHER______________", title: "Cooking Channel" },
		]);

		expect(results.map((result) => result.id)).toEqual([
			"UC_VALID______________",
		]);
	});

	it("scores handles as searchable text", () => {
		expect(
			scoreChannelResult("level1techs", {
				id: "UC1234567890123456789012",
				title: "Level One Techs",
				customUrl: "/channel/level1techs",
			}),
		).toBeGreaterThan(60);
	});

	it("scores compact natural language matches against channel names", () => {
		expect(
			scoreChannelResult("level one techs", {
				id: "UC1234567890123456789012",
				title: "Level1Techs",
				customUrl: "/@level1techs",
			}),
		).toBeGreaterThan(60);
	});

	it("scores meaningful-token matches above stopword noise", () => {
		// "the best woodworking channels" → meaningful "woodworking"
		expect(
			scoreChannelResult("the best woodworking channels", {
				id: "UC1234567890123456789012",
				title: "Woodworking Art",
			}),
		).toBeGreaterThan(50);

		// A channel with no woodworking connection scores 0.
		expect(
			scoreChannelResult("the best woodworking channels", {
				id: "UC2222222222222222222222",
				title: "The Big Bang Theory",
			}),
		).toBe(0);
	});

	it("parses channel results from YouTube search markup", () => {
		const results = parseYouTubeChannelSearchResults(`
            "channelRenderer":{"channelId":"UCHnyfMqiRRG1u-2MsSQLbXA","title":{"simpleText":"Veritasium"},"thumbnail":{"thumbnails":[{"url":"//yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj","width":88,"height":88}]},"descriptionSnippet":{"runs":[{"text":"Science videos"}]},"navigationEndpoint":{"browseEndpoint":{"canonicalBaseUrl":"/@veritasium"}}}
        `);

		expect(results).toEqual([
			{
				id: "UCHnyfMqiRRG1u-2MsSQLbXA",
				title: "Veritasium",
				description: "Science videos",
				thumbnail: "https://yt3.ggpht.com/avatar=s88-c-k-c0x00ffffff-no-rj",
				customUrl: "/@veritasium",
			},
		]);
	});
});

describe("fuzzy keyword matching", () => {
	it("matches a typo'd token against a channel title", () => {
		// "linx" (typo) should still match "Linux" — 1 edit, 4 chars
		expect(
			scoreChannelResult("linx tech", {
				id: "UC1234567890123456789012",
				title: "Linux Tech",
			}),
		).toBeGreaterThan(0);
	});

	it("matches a longer typo against a longer channel name", () => {
		// "woodworing" (2 typos) should match "woodworking" — 2 edits, 11 chars
		expect(
			scoreChannelResult("woodworing", {
				id: "UC1234567890123456789012",
				title: "Steve Ramsey Woodworking",
			}),
		).toBeGreaterThan(0);
	});

	it("matches a substring token against a longer title token", () => {
		// "tech" should match "technology" — substring match
		expect(
			scoreChannelResult("tech", {
				id: "UC1234567890123456789012",
				title: "Technology Connections",
			}),
		).toBeGreaterThan(0);
	});

	it("ranks exact matches above fuzzy matches", () => {
		const exact = scoreChannelResult("linux tech", {
			id: "UC_EXACT_______________",
			title: "Linux Tech",
		});
		const fuzzy = scoreChannelResult("linx tech", {
			id: "UC_FUZZY_______________",
			title: "Linux Tech",
		});

		expect(exact).toBeGreaterThan(fuzzy);
	});

	it("returns 0 for completely unrelated queries", () => {
		expect(
			scoreChannelResult("quantum physics", {
				id: "UC1234567890123456789012",
				title: "Cooking Channel",
			}),
		).toBe(0);
	});

	it("handles multi-token queries with mixed exact and fuzzy matches", () => {
		// "linx tech" → "linx" fuzzy-matches "linux", "tech" exact-matches "tech"
		const results = dedupeAndRankChannels("linx tech", [
			{ id: "UC_A__________________", title: "Linux Tech Tips" },
			{ id: "UC_B__________________", title: "Tech News" },
			{ id: "UC_C__________________", title: "Cooking Show" },
		]);

		// Linux Tech Tips should rank first (both tokens match, even if fuzzy)
		expect(results[0]?.id).toBe("UC_A__________________");
		// Tech News should rank above Cooking Show (1 exact match vs 0)
		const techNews = results.find((r) => r.id === "UC_B__________________");
		const cooking = results.find((r) => r.id === "UC_C__________________");
		if (techNews && cooking) {
			expect(techNews.score).toBeGreaterThan(cooking.score);
		}
	});

	it("matches against customUrl/handle as well as title", () => {
		// "lvl1techs" with 1 typo should match handle "/@level1techs"
		expect(
			scoreChannelResult("lvl1techs", {
				id: "UC1234567890123456789012",
				title: "Level One Techs",
				customUrl: "/@level1techs",
			}),
		).toBeGreaterThan(0);
	});

	it("skips Levenshtein for very short tokens to avoid noise", () => {
		// 2-char token "js" should not fuzzy-match "java" (1 edit would be
		// 50% similarity, too noisy). Exact match only.
		expect(
			scoreChannelResult("js", {
				id: "UC1234567890123456789012",
				title: "JavaScript Mastery",
			}),
		).toBe(0);
	});
});

describe("direct identifier resolution", () => {
	const { resetQuotaForTesting } = require("./youtube-api-search");

	beforeEach(() => resetQuotaForTesting());

	it("detects bare channel IDs", () => {
		expect(detectChannelIdentity("UCBR8-60-B28hp2BmDPdntcQ")).toEqual({
			type: "channel_id",
			value: "UCBR8-60-B28hp2BmDPdntcQ",
		});
	});

	it("detects @handles", () => {
		expect(detectChannelIdentity("@mkbhd")).toEqual({
			type: "handle",
			value: "mkbhd",
		});
	});

	it("detects YouTube channel URLs", () => {
		expect(
			detectChannelIdentity(
				"https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ",
			),
		).toEqual({
			type: "channel_id",
			value: "UCBR8-60-B28hp2BmDPdntcQ",
		});
	});

	it("detects YouTube @handle URLs", () => {
		expect(detectChannelIdentity("https://www.youtube.com/@mkbhd")).toEqual({
			type: "handle",
			value: "mkbhd",
		});
	});

	it("returns null for keyword queries", () => {
		expect(detectChannelIdentity("linux tech")).toBeNull();
		expect(detectChannelIdentity("woodworking")).toBeNull();
		expect(detectChannelIdentity("the best cooking channels")).toBeNull();
	});

	it("resolves channel IDs via channels.list, not search.list", async () => {
		let searchListCalled = false;
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com/youtube/v3/channels")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						items: [
							{
								id: "UCBR8-60-B28hp2BmDPdntcQ",
								snippet: {
									title: "YouTube",
									description: "YouTube's official channel",
									thumbnails: {
										medium: { url: "https://example.com/yt.jpg" },
									},
									customUrl: "@youtube",
								},
								statistics: {
									subscriberCount: "50000000",
									videoCount: "1000",
								},
							},
						],
					}),
				};
			}
			if (urlStr.includes("googleapis.com/youtube/v3/search")) {
				searchListCalled = true;
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("UCBR8-60-B28hp2BmDPdntcQ", {
			fetchImpl,
			youtubeApiKey: "yt-key",
		});

		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("UCBR8-60-B28hp2BmDPdntcQ");
		expect(results[0].title).toBe("YouTube");
		expect(results[0].subscriberCount).toBe("50000000");
		expect(searchListCalled).toBe(false);
	});

	it("resolves @handles via channels.list forHandle", async () => {
		let searchListCalled = false;
		let forHandleParam = null;
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com/youtube/v3/channels")) {
				const u = new URL(urlStr, "http://dummy");
				forHandleParam = u.searchParams.get("forHandle");
				return {
					ok: true,
					status: 200,
					json: async () => ({
						items: [
							{
								id: "UCBJycr3I2uIQHu5F2q5p5Gw",
								snippet: {
									title: "Marques Brownlee",
									description: "MKBHD",
									thumbnails: {
										medium: {
											url: "https://example.com/mkbhd.jpg",
										},
									},
									customUrl: "@mkbhd",
								},
								statistics: { subscriberCount: "19000000" },
							},
						],
					}),
				};
			}
			if (urlStr.includes("googleapis.com/youtube/v3/search")) {
				searchListCalled = true;
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("@mkbhd", {
			fetchImpl,
			youtubeApiKey: "yt-key",
		});

		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("Marques Brownlee");
		expect(results[0].subscriberCount).toBe("19000000");
		expect(forHandleParam).toBe("@mkbhd");
		expect(searchListCalled).toBe(false);
	});

	it("resolves YouTube URLs by extracting the handle", async () => {
		let searchListCalled = false;
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com/youtube/v3/channels")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						items: [
							{
								id: "UCBJycr3I2uIQHu5F2q5p5Gw",
								snippet: {
									title: "Marques Brownlee",
									customUrl: "@mkbhd",
								},
							},
						],
					}),
				};
			}
			if (urlStr.includes("googleapis.com/youtube/v3/search")) {
				searchListCalled = true;
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("https://www.youtube.com/@mkbhd", {
			fetchImpl,
			youtubeApiKey: "yt-key",
		});

		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("Marques Brownlee");
		expect(searchListCalled).toBe(false);
	});

	it("falls through to keyword search when direct resolution finds nothing", async () => {
		let channelsListCalled = false;
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com/youtube/v3/channels")) {
				channelsListCalled = true;
				return { ok: true, status: 200, json: async () => ({ items: [] }) };
			}
			if (urlStr.includes("googleapis.com/youtube/v3/search")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						items: [
							{
								id: { channelId: "UC1234567890123456789012" },
								snippet: {
									title: "Linux Tips",
									description: "Daily Linux",
								},
							},
						],
					}),
				};
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		// channels.list returns empty (invalid/unfound ID) — should fall
		// through to keyword search.list which finds the channel.
		const results = await searchChannels("UC1234567890123456789012", {
			fetchImpl,
			youtubeApiKey: "yt-key",
		});

		expect(channelsListCalled).toBe(true);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].id).toBe("UC1234567890123456789012");
	});

	describe("scrape fallback when YOUTUBE_API_KEY is not set", () => {
		const ORIGINAL_YT_KEY = process.env.YOUTUBE_API_KEY;

		beforeEach(() => {
			clearSearchCache();
			delete process.env.YOUTUBE_API_KEY;
		});

		afterEach(() => {
			if (ORIGINAL_YT_KEY !== undefined) {
				process.env.YOUTUBE_API_KEY = ORIGINAL_YT_KEY;
			}
		});

		it("resolves a /channel/UC... URL by scraping the YouTube page", async () => {
			let scrapedUrl = null;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error(
						"Should not call YouTube Data API when no key is set",
					);
				}
				if (urlStr.includes("youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ")) {
					scrapedUrl = urlStr;
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ" />' +
							'<meta property="og:title" content="YouTube" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels(
				"https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ",
				{ fetchImpl },
			);

			expect(scrapedUrl).toContain(
				"youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ",
			);
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("UCBR8-60-B28hp2BmDPdntcQ");
			expect(results[0].title).toBe("YouTube");
		});

		it("resolves an @handle URL by scraping the YouTube page", async () => {
			let scrapedUrl = null;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error(
						"Should not call YouTube Data API when no key is set",
					);
				}
				if (urlStr.includes("youtube.com/@mkbhd")) {
					scrapedUrl = urlStr;
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCBJycr3I2uIQHu5F2q5p5Gw" />' +
							'<meta property="og:title" content="Marques Brownlee" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels("https://www.youtube.com/@mkbhd", {
				fetchImpl,
			});

			expect(scrapedUrl).toContain("youtube.com/@mkbhd");
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("UCBJycr3I2uIQHu5F2q5p5Gw");
			expect(results[0].title).toBe("Marques Brownlee");
			expect(results[0].customUrl).toBe("/@mkbhd");
		});

		it("resolves a bare @handle by scraping the YouTube page", async () => {
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error(
						"Should not call YouTube Data API when no key is set",
					);
				}
				if (urlStr.includes("youtube.com/@veritasium")) {
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA" />' +
							'<meta property="og:title" content="Veritasium" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels("@veritasium", { fetchImpl });

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("UCHnyfMqiRRG1u-2MsSQLbXA");
			expect(results[0].title).toBe("Veritasium");
		});

		it("resolves a bare channel ID by scraping the YouTube page", async () => {
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error(
						"Should not call YouTube Data API when no key is set",
					);
				}
				if (urlStr.includes("youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ")) {
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ" />' +
							'<meta property="og:title" content="YouTube" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels("UCBR8-60-B28hp2BmDPdntcQ", {
				fetchImpl,
			});

			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("UCBR8-60-B28hp2BmDPdntcQ");
			expect(results[0].title).toBe("YouTube");
		});

		it("rejects a /channel/URL that redirects to a different channel", async () => {
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error("Should not call API");
				}
				if (urlStr.includes("youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ")) {
					// YouTube redirected to a different channel — the canonical
					// link doesn't match the requested ID, so reject it.
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCDIFFERENT00000000000000" />' +
							'<meta property="og:title" content="Wrong Channel" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels(
				"https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ",
				{ fetchImpl },
			);

			// Scrape rejected the mismatched ID, so we get no results
			// from the scrape path. (The keyword/scrape fallback tiers
			// also return empty in this mock — the key assertion is that
			// we did NOT get the wrong channel ID.)
			const wrongId = results.find((r) => r.id === "UCDIFFERENT00000000000000");
			expect(wrongId).toBeUndefined();
		});

		it("falls through to keyword search when scrape returns no channel ID", async () => {
			let scrapeCalled = false;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error("Should not call API");
				}
				if (urlStr.includes("youtube.com/@nonexistent")) {
					scrapeCalled = true;
					// YouTube returns a 404 for invalid handles
					return {
						ok: false,
						status: 404,
						text: async () => "Not Found",
						json: async () => ({}),
					};
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels("@nonexistent", { fetchImpl });

			expect(scrapeCalled).toBe(true);
			// No API, no scrape result — should return empty array
			// rather than throwing or returning wrong results.
			expect(results).toEqual([]);
		});

		it("prefers the YouTube Data API over scraping when a key is set", async () => {
			let apiCalled = false;
			let scrapeCalled = false;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com/youtube/v3/channels")) {
					apiCalled = true;
					return {
						ok: true,
						status: 200,
						json: async () => ({
							items: [
								{
									id: "UCBR8-60-B28hp2BmDPdntcQ",
									snippet: {
										title: "YouTube",
										description: "YouTube's official channel",
										thumbnails: {
											medium: {
												url: "https://example.com/yt.jpg",
											},
										},
										customUrl: "@youtube",
									},
									statistics: {
										subscriberCount: "50000000",
										videoCount: "1000",
									},
								},
							],
						}),
					};
				}
				if (urlStr.includes("youtube.com/")) {
					scrapeCalled = true;
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels(
				"https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ",
				{ fetchImpl, youtubeApiKey: "yt-key" },
			);

			expect(apiCalled).toBe(true);
			expect(scrapeCalled).toBe(false);
			expect(results).toHaveLength(1);
			expect(results[0].subscriberCount).toBe("50000000");
		});

		it("tries concatenated handle for multi-word person-name queries", async () => {
			let scrapedUrl = null;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error("Should not call API");
				}
				if (urlStr.includes("youtube.com/@marionawfal")) {
					scrapedUrl = urlStr;
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCTWBp-39z6tvz4-LQB-Z_QA" />' +
							'<meta property="og:title" content="Mario Nawfal" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 500,
					text: async () => "",
					json: async () => ({}),
				};
			};

			const results = await searchChannels("mario nawfal", { fetchImpl });

			expect(scrapedUrl).toContain("youtube.com/@marionawfal");
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("UCTWBp-39z6tvz4-LQB-Z_QA");
			expect(results[0].title).toBe("Mario Nawfal");
		});

		it("falls through when concatenated handle does not exist", async () => {
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("googleapis.com")) {
					throw new Error("Should not call API");
				}
				// All YouTube page fetches return 404 — no handle resolves
				return {
					ok: false,
					status: 404,
					text: async () => "Not Found",
					json: async () => ({}),
				};
			};

			const results = await searchChannels("random xyz query", { fetchImpl });

			// No handle resolves, no API, no Brave — returns empty
			expect(results).toEqual([]);
		});
	});

	describe("tier 6a: OpenCode big-pickle (function-calling with web_search tool)", () => {
		beforeEach(() => {
			clearSearchCache();
		});

		it("falls through to OpenCode when lower tiers miss", async () => {
			let opencodeCalled = false;
			let verifyPageUrl = null;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				// OpenCode big-pickle call
				if (urlStr.includes("opencode.ai/zen/v1/chat/completions")) {
					opencodeCalled = true;
					return {
						ok: true,
						status: 200,
						json: async () => ({
							choices: [
								{
									message: {
										role: "assistant",
										content: JSON.stringify({
											handle: "MarioNawfal",
											title: "Mario Nawfal",
										}),
									},
								},
							],
						}),
					};
				}
				// YouTube page scrape to verify
				if (urlStr.includes("youtube.com/@MarioNawfal")) {
					verifyPageUrl = urlStr;
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCTWBp-39z6tvz4-LQB-Z_QA" />' +
							'<meta property="og:title" content="Mario Nawfal" />' +
							"</head><body></body></html>",
					};
				}
				throw new Error(`Unexpected fetch: ${urlStr}`);
			};
			const results = await searchChannels("mario nafal typo", {
				fetchImpl,
				opencodeKey: "test-opencode-key",
			});
			expect(opencodeCalled).toBe(true);
			expect(verifyPageUrl).toContain("youtube.com/@MarioNawfal");
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("UCTWBp-39z6tvz4-LQB-Z_QA");
			expect(results[0].title).toBe("Mario Nawfal");
		});

		it("skips OpenCode entirely without an opencodeKey", async () => {
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("opencode.ai")) {
					throw new Error("OpenCode should not be called without a key");
				}
				return {
					ok: false,
					status: 404,
					text: async () => "Not Found",
					json: async () => ({}),
				};
			};
			const results = await searchChannels("obscure query xyz", {
				fetchImpl,
			});
			expect(results).toEqual([]);
		});


		it("uses DDG HTML as the web_search backend when no Brave key is set", async () => {
			let opencodeCalls = 0;
			let ddgCalled = false;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("opencode.ai")) {
					opencodeCalls++;
					// First call: model asks for web_search.
					// Second call: model returns the final answer.
					if (opencodeCalls === 1) {
						return {
							ok: true,
							status: 200,
							json: async () => ({
								choices: [
									{
										message: {
											role: "assistant",
											content: null,
											tool_calls: [
												{
													id: "call_1",
													type: "function",
													function: {
														name: "web_search",
														arguments: JSON.stringify({
															query: "mario nawfal",
														}),
													},
												},
											],
										},
									},
								],
							}),
						};
					}
					return {
						ok: true,
						status: 200,
						json: async () => ({
							choices: [
								{
									message: {
										role: "assistant",
										content: JSON.stringify({
											handle: "MarioNawfal",
											title: "Mario Nawfal",
										}),
									},
								},
							],
						}),
					};
				}
				if (urlStr.includes("html.duckduckgo.com")) {
					ddgCalled = true;
					return {
						ok: true,
						status: 200,
						text: async () =>
							'<a class="result__a" href="https://www.youtube.com/@MarioNawfal">Mario Nawfal</a>' +
							'<a class="result__snippet">Interviews</a>',
					};
				}
				if (urlStr.includes("youtube.com/@MarioNawfal")) {
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCTWBp-39z6tvz4-LQB-Z_QA" />' +
							'<meta property="og:title" content="Mario Nawfal" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 404,
					text: async () => "",
					json: async () => ({}),
				};
			};
			const results = await searchChannels("mario nafal", {
				fetchImpl,
				opencodeKey: "test-opencode-key",
			});
			expect(opencodeCalls).toBe(2);
			expect(ddgCalled).toBe(true);
			expect(results).toHaveLength(1);
			expect(results[0].id).toBe("UCTWBp-39z6tvz4-LQB-Z_QA");
		});

		it("does not call OpenCode when no lower tier misses (e.g. concatenated handle succeeds)", async () => {
			let opencodeCalled = false;
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("opencode.ai")) {
					opencodeCalled = true;
					throw new Error(
						"OpenCode should not be called when tier 0b succeeds",
					);
				}
				if (urlStr.includes("youtube.com/@marionawfal")) {
					return {
						ok: true,
						status: 200,
						text: async () =>
							"<html><head>" +
							'<link rel="canonical" href="https://www.youtube.com/channel/UCTWBp-39z6tvz4-LQB-Z_QA" />' +
							'<meta property="og:title" content="Mario Nawfal" />' +
							"</head><body></body></html>",
					};
				}
				return {
					ok: false,
					status: 404,
					text: async () => "Not Found",
					json: async () => ({}),
				};
			};
			const results = await searchChannels("mario nawfal", {
				fetchImpl,
				opencodeKey: "test-opencode-key",
			});
			expect(opencodeCalled).toBe(false);
			expect(results).toHaveLength(1);
		});

		it("aborts the OpenCode tool loop on max iterations and returns empty", async () => {
			// OpenCode keeps asking for web_search, never returns a final answer
			const fetchImpl = async (url) => {
				const urlStr = String(url);
				if (urlStr.includes("opencode.ai")) {
					return {
						ok: true,
						status: 200,
						json: async () => ({
							choices: [
								{
									message: {
										role: "assistant",
										content: null,
										tool_calls: [
											{
												id: "call_x",
												type: "function",
												function: {
													name: "web_search",
													arguments: JSON.stringify({ query: "x" }),
												},
											},
										],
									},
								},
							],
						}),
					};
				}
				if (urlStr.includes("html.duckduckgo.com")) {
					return { ok: true, status: 200, text: async () => "" };
				}
				return {
					ok: false,
					status: 404,
					text: async () => "",
					json: async () => ({}),
				};
			};
			const results = await searchChannels("obscure query xyz", {
				fetchImpl,
				opencodeKey: "test-opencode-key",
			});
			expect(results).toEqual([]);
		});
	});
});

describe("search fallback chain", () => {
	const { resetQuotaForTesting } = require("./youtube-api-search");

	beforeEach(() => resetQuotaForTesting());

	it("uses YouTube API as the primary search backend", async () => {
		let scrapeCalled = false;
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com/youtube/v3/search")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						items: [
							{
								id: { channelId: "UC1234567890123456789012" },
								snippet: {
									title: "Woodworking Art",
									description: "Woodworking",
									thumbnails: {
										medium: { url: "https://example.com/thumb.jpg" },
									},
								},
							},
						],
					}),
				};
			}
			if (urlStr.includes("youtube.com/results")) {
				scrapeCalled = true;
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("woodworking", {
			fetchImpl,
			limit: 5,
			youtubeApiKey: "yt-key",
		});

		expect(results.length).toBeGreaterThan(0);
		expect(results[0].id).toBe("UC1234567890123456789012");
		expect(scrapeCalled).toBe(false);
	});

	it("falls through to Brave when YouTube API has no results", async () => {
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com/youtube/v3/search")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({ items: [] }),
				};
			}
			if (urlStr.includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: {
							results: [
								{
									title: "Tech Review Daily - YouTube",
									url: "https://www.youtube.com/channel/UC8888888888888888888888",
									description: "Daily tech reviews and comparisons",
								},
							],
						},
					}),
				};
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("tech review", {
			fetchImpl,
			limit: 5,
			youtubeApiKey: "yt-key",
			braveKey: "brave-key",
		});

		expect(results.length).toBeGreaterThan(0);
		expect(results[0].id).toBe("UC8888888888888888888888");
	});

	it("falls through to scrape when both API and Brave return nothing", async () => {
		let scrapeCalled = false;
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com/youtube/v3/search")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({ items: [] }),
				};
			}
			if (urlStr.includes("api.search.brave.com")) {
				return {
					ok: true,
					status: 200,
					json: async () => ({
						web: { results: [] },
					}),
				};
			}
			if (urlStr.includes("youtube.com/results")) {
				scrapeCalled = true;
				return {
					ok: true,
					text: async () =>
						`"channelRenderer":{"channelId":"UC9999999999999999999999","title":{"simpleText":"Linux Tips"}}`,
				};
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("linux", {
			fetchImpl,
			limit: 5,
			youtubeApiKey: "yt-key",
			braveKey: "brave-key",
		});

		expect(scrapeCalled).toBe(true);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].id).toBe("UC9999999999999999999999");
	});

	it("skips API and Brave when no keys provided, goes straight to scrape", async () => {
		let apiCalled = false;
		let braveCalled = false;
		const fetchImpl = async (url) => {
			const urlStr = String(url);
			if (urlStr.includes("googleapis.com")) {
				apiCalled = true;
			}
			if (urlStr.includes("brave.com")) {
				braveCalled = true;
			}
			if (urlStr.includes("pipedapi") || urlStr.includes("api.piped")) {
				return {
					ok: true,
					json: async () => ({
						items: [
							{
								url: "/channel/UC1234567890123456789012",
								name: "Piped Channel",
							},
						],
					}),
				};
			}
			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		// No API keys passed — should skip YouTube API and Brave entirely
		await searchChannels("linux", {
			fetchImpl,
			limit: 5,
		});

		expect(apiCalled).toBe(false);
		expect(braveCalled).toBe(false);
	});
});

describe("channel search cache", () => {
	it("searches generated query variants and ranks them against the original phrase", async () => {
		const requestedUrls = [];
		const fetchImpl = async (url) => {
			requestedUrls.push(String(url));
			if (String(url).includes("levelonetechs")) {
				return {
					ok: true,
					json: async () => ({
						items: [
							{
								url: "/channel/UC1234567890123456789012",
								name: "Level1Techs",
								description: "Computer hardware and Linux videos",
								thumbnail: "https://example.com/level.jpg",
								subscribers: 1000000,
							},
						],
					}),
					text: async () => "",
				};
			}

			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("Level One Techs", {
			fetchImpl,
			limit: 3,
		});

		expect(results[0]).toEqual(
			expect.objectContaining({
				id: "UC1234567890123456789012",
				title: "Level1Techs",
			}),
		);
		expect(requestedUrls.some((url) => url.includes("levelonetechs"))).toBe(
			true,
		);
	});

	it("finds channels via the meaningful query when the original phrase fails", async () => {
		const getUrlQuery = (url) => {
			const u = new URL(String(url), "http://dummy");
			return (
				u.searchParams.get("q") || u.searchParams.get("search_query") || ""
			);
		};

		const fetchImpl = async (url) => {
			// Only the bare meaningful query "woodworking" returns results.
			// The original phrase "the best woodworking channels" returns 500,
			// proving that the meaningful query is what finds the channel.
			if (getUrlQuery(url) === "woodworking") {
				return {
					ok: true,
					json: async () => ({
						items: [
							{
								url: "/channel/UC3333333333333333333333",
								name: "Woodworking Art",
								description: "Fine woodworking tutorials",
								thumbnail: "https://example.com/ww.jpg",
								subscribers: 500000,
							},
						],
					}),
					text: async () => "",
				};
			}

			return {
				ok: false,
				status: 500,
				json: async () => [],
				text: async () => "",
			};
		};

		const results = await searchChannels("the best woodworking channels", {
			fetchImpl,
			limit: 3,
		});

		expect(results[0]).toEqual(
			expect.objectContaining({
				id: "UC3333333333333333333333",
				title: "Woodworking Art",
			}),
		);
	});

	it("caps cached results at the configured LRU size", async () => {
		const emptyFetch = async () => ({
			ok: false,
			status: 500,
			json: async () => [],
			text: async () => "",
		});
		const before = getSearchCacheStats().size;

		for (let i = 0; i < 150; i += 1) {
			await searchChannels(`query-${i}`, { fetchImpl: emptyFetch, limit: 1 });
		}

		const after = getSearchCacheStats();
		expect(after.size).toBeLessThanOrEqual(100);
		expect(after.maxEntries).toBe(100);
		expect(after.size).toBeGreaterThanOrEqual(before);
	});
});
