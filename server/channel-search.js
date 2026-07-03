const { createLruCache } = require("./utils");
const { searchYouTubeApiChannels } = require("./youtube-api-search");
const { parseYouTubeUrl } = require("./brave-channel-search");
const { extractYouTubeChannelMetadata } = require("./youtube-html-parser");
const {
	extractYouTubeInitialData,
	findYouTubeChannelCandidates,
} = require("./youtube-discovery");
const resolveChannelViaLlmProvider =
	require("./llm-channel-resolver").resolveChannelViaLlm;

const SEARCH_TIMEOUT_MS = 8000;
const SEARCH_CACHE_MS = 30000;
const SEARCH_CACHE_MAX_ENTRIES = 100;

// English stopwords that don't help channel search. Filtering them before the
// multi-token abbreviation logic keeps natural-language queries like
// "the best woodworking channels" from generating nonsense abbreviations
// like "thec" or "tbtwc" that match random "The X" channels. The original
// query and its compact form are still added separately, so full-text
// matching is preserved.
const STOPWORDS = new Set([
	"a",
	"an",
	"the",
	"and",
	"or",
	"of",
	"for",
	"with",
	"to",
	"best",
	"top",
	"good",
	"great",
	"channels",
	"channel",
	"youtube",
	"videos",
]);
const NUMBER_WORDS = {
	0: "zero",
	1: "one",
	2: "two",
	3: "three",
	4: "four",
	5: "five",
	6: "six",
	7: "seven",
	8: "eight",
	9: "nine",
};

const searchCache = createLruCache({ maxEntries: SEARCH_CACHE_MAX_ENTRIES });

function getCacheKey(query) {
	return normalizeText(query);
}

function getCachedResults(query) {
	const key = getCacheKey(query);
	const cached = searchCache.get(key);
	if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_MS) {
		return cached.results;
	}
	return null;
}

function setCachedResults(query, results) {
	const key = getCacheKey(query);
	searchCache.set(key, { results, timestamp: Date.now() });
}

// withTimeout was replaced by AbortController in searchChannels — see below.

function normalizeText(value) {
	return String(value || "")
		.toLowerCase()
		.replace(/^@/, "")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Levenshtein (edit) distance between two strings — the minimum number
 * of single-character insertions, deletions, or substitutions needed to
 * turn one into the other. O(m*n) time, O(min(m,n)) space using two
 * rolling rows. Used for typo-tolerant channel search.
 */
function levenshteinDistance(a, b) {
	if (a === b) return 0;
	if (!a) return b.length;
	if (!b) return a.length;

	// Iterate over the shorter string in the inner loop to save space.
	if (a.length > b.length) [a, b] = [b, a];

	const m = a.length;
	const n = b.length;
	let prev = new Array(m + 1);
	let curr = new Array(m + 1);
	for (let i = 0; i <= m; i++) prev[i] = i;

	for (let j = 1; j <= n; j++) {
		curr[0] = j;
		for (let i = 1; i <= m; i++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[i] = Math.min(
				curr[i - 1] + 1, // insertion
				prev[i] + 1, // deletion
				prev[i - 1] + cost, // substitution
			);
		}
		[prev, curr] = [curr, prev];
	}

	return prev[m];
}

/**
 * Find the best fuzzy match score for a query token against a list of
 * text tokens. Returns:
 *   1.0  for an exact match
 *   0.85 for a substring match (e.g. "tech" in "technology")
 *   0.5–0.9 for a Levenshtein-based match (typo tolerance)
 *   0    for no match
 *
 * Typo threshold: 1 edit for tokens 4-5 chars long, 2 edits for 6+ chars.
 * Tokens shorter than 3 chars skip Levenshtein to avoid noise.
 */
function fuzzyTokenScore(queryToken, textTokens) {
	if (!queryToken || !textTokens || textTokens.length === 0) return 0;

	let bestScore = 0;

	for (const textToken of textTokens) {
		if (!textToken) continue;

		if (textToken === queryToken) return 1.0;

		// Substring match (e.g. "tech" matches "technology")
		if (textToken.includes(queryToken) || queryToken.includes(textToken)) {
			const score = 0.85;
			if (score > bestScore) bestScore = score;
			continue;
		}

		// Skip very short tokens — Levenshtein is too noisy on 1-2 char strings.
		if (queryToken.length < 3 || textToken.length < 3) continue;

		const distance = levenshteinDistance(queryToken, textToken);
		const maxLen = Math.max(queryToken.length, textToken.length);

		// 1 edit for 4-5 char tokens, 2 edits for 6+ char tokens.
		const maxDistance = maxLen >= 6 ? 2 : 1;
		if (distance <= maxDistance) {
			const score = 1 - distance / maxLen;
			if (score > bestScore) bestScore = score;
		}
	}

	return bestScore;
}

function compactSearchText(value) {
	return normalizeText(value).replace(/\s+/g, "");
}

function normalizeYouTubeIdentity(value) {
	return compactSearchText(value)
		.replace(/official|channel|youtube/g, "")
		.replace(/\d/g, (digit) => NUMBER_WORDS[digit] || "")
		.trim();
}

// Extract meaningful (non-stopword) tokens from a query.
function getMeaningfulTokens(query) {
	const normalized = normalizeText(query);
	if (!normalized) return [];
	return normalized
		.split(/\s+/)
		.filter((token) => token && !STOPWORDS.has(token));
}

// Return the stopword-stripped search text for ranking / query generation.
// Falls back to "" when every token is a stopword, signalling "do not search".
function getMeaningfulSearchText(query) {
	const tokens = getMeaningfulTokens(query);
	if (tokens.length === 0) return "";
	return tokens.join(" ");
}

function buildChannelSearchQueries(query, maxQueries = 6) {
	const normalized = normalizeText(query);
	if (!normalized) return [];

	const allTokens = normalized.split(/\s+/).filter(Boolean);
	const meaningfulTokens = allTokens.filter((token) => !STOPWORDS.has(token));

	if (meaningfulTokens.length === 0) return [];

	const meaningful = meaningfulTokens.join(" ");
	const meaningfulCompact = compactSearchText(meaningful);

	const queries = [];
	const seen = new Set();
	const add = (value) => {
		const trimmed = String(value || "").trim();
		if (!trimmed || seen.has(trimmed)) return;
		seen.add(trimmed);
		queries.push(trimmed);
	};

	if (meaningfulTokens.length > 1) {
		const first = meaningfulTokens[0];
		const last = meaningfulTokens[meaningfulTokens.length - 1];
		const firstPlusInitial = `${first}${last[0]}`;

		// Prioritize the meaningful phrase and its variants so the backends
		// search for the actual topic ("tech review"), not stopword-noise
		// abbreviations. Abbreviations and the original phrasing are kept
		// as lower-priority fallbacks.
		add(meaningful); // "tech review"
		add(`${meaningful} channel`); // "tech review channel"
		add(meaningfulCompact); // "techreview"
		add(firstPlusInitial); // "techr"
		add(`@${firstPlusInitial}`); // "@techr"
		add(normalized); // "best tech review channels"
	} else {
		// Single meaningful token — prioritize it directly.
		add(meaningful); // "woodworking"
		add(`${meaningful} channel`); // "woodworking channel"
		add(normalized); // "the best woodworking channels"
	}

	return queries.slice(0, maxQueries);
}

function scoreChannelResult(query, channel) {
	// Rank against the stopword-stripped meaningful query so that
	// "the best woodworking channels" scores a "Woodworking Art" channel
	// highly, instead of losing to channels that merely contain "the".
	const identity = detectChannelIdentity(query);
	const identityQuery = identity?.value
		? normalizeYouTubeIdentity(identity.value)
		: "";
	const meaningfulQuery =
		getMeaningfulSearchText(query) || normalizeText(query);
	const normalizedQuery = meaningfulQuery;
	const compactQuery = compactSearchText(meaningfulQuery);
	const title = normalizeText(channel.title);
	const compactTitle = compactSearchText(channel.title);
	const normalizedTitleIdentity = normalizeYouTubeIdentity(channel.title);
	const handle = normalizeText(channel.customUrl || channel.handle || "");
	const description = normalizeText(channel.description || "");
	const haystack = `${title} ${handle} ${description}`.trim();
	const compactHaystack = compactSearchText(haystack);

	if (!normalizedQuery || !title) return 0;
	if (identityQuery) {
		if (normalizedTitleIdentity === identityQuery) return 100;
		if (handle.includes(identityQuery) || title.includes(identityQuery))
			return 95;
	}
	if (title === normalizedQuery || handle === normalizedQuery) return 92;
	if (compactTitle === compactQuery || handle === compactQuery) return 90;
	if (
		normalizedTitleIdentity &&
		normalizedTitleIdentity === normalizeYouTubeIdentity(query)
	)
		return 88;
	if (title.startsWith(normalizedQuery) || handle.startsWith(normalizedQuery))
		return 85;
	if (title.includes(normalizedQuery) || handle.includes(normalizedQuery))
		return 70;
	if (compactQuery && compactHaystack.includes(compactQuery)) return 68;

	const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
	if (queryTokens.length === 0) return 0;

	// Token-level matching. Exact matches score 60 (all tokens hit).
	// Fuzzy matches (typos, substring) score up to 40 as a supplement
	// so typo'd queries still surface relevant channels without
	// outscoring exact matches.
	const titleTokens = title.split(/\s+/).filter(Boolean);
	const handleTokens = handle.split(/\s+/).filter(Boolean);
	const allTextTokens = [...titleTokens, ...handleTokens];

	const matchedTokens = queryTokens.filter((token) =>
		haystack.includes(token),
	).length;
	const tokenScore = Math.round((matchedTokens / queryTokens.length) * 60);

	// Fuzzy bonus: for query tokens that didn't exact-match, check if
	// they fuzzy-match any title/handle token (typo tolerance).
	const unmatchedTokens = queryTokens.filter(
		(token) => !haystack.includes(token),
	);
	const fuzzyMatched = unmatchedTokens.filter(
		(token) => fuzzyTokenScore(token, allTextTokens) > 0,
	).length;
	const fuzzyBonus =
		fuzzyMatched > 0 ? Math.round((fuzzyMatched / queryTokens.length) * 40) : 0;

	const leadingTokenBonus =
		title.startsWith(queryTokens[0]) || handle.startsWith(queryTokens[0])
			? 15
			: 0;

	return tokenScore + fuzzyBonus + leadingTokenBonus;
}

function dedupeAndRankChannels(
	query,
	channels,
	limit = 8,
	filterByScore = true,
) {
	const byId = new Map();

	channels.forEach((channel) => {
		if (!channel?.id || !channel?.title) return;
		if (!channel.id.startsWith("UC")) return;

		const existing = byId.get(channel.id);
		if (
			!existing ||
			scoreChannelResult(query, channel) > scoreChannelResult(query, existing)
		) {
			byId.set(channel.id, channel);
		}
	});

	const ranked = Array.from(byId.values()).map((channel) => ({
		...channel,
		score: scoreChannelResult(query, channel),
	}));

	const filtered = filterByScore
		? ranked.filter((channel) => channel.score > 0)
		: ranked;

	return filtered
		.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
		.slice(0, limit);
}

function normalizeThumbnail(url) {
	if (!url || typeof url !== "string") return "";
	if (url.startsWith("//")) return `https:${url}`;
	return url;
}

function parseYouTubeChannelSearchResults(html) {
	const results = [];
	const matches = String(html).matchAll(
		/"channelRenderer":\{"channelId":"(UC[^"]+)"([\s\S]*?)(?="channelRenderer"|"continuationItemRenderer"|"shelfRenderer"|<\/script>|$)/g,
	);

	for (const match of matches) {
		const [, channelId, block] = match;
		const title = block.match(/"title":\{"simpleText":"([^"]+)"/)?.[1];
		if (!title) continue;

		const thumbnail = block.match(
			/"thumbnail":\{"thumbnails":\[[\s\S]*?\{"url":"([^"]+)"/,
		)?.[1];
		const description =
			block.match(/"descriptionSnippet":\{"runs":\[\{"text":"([^"]+)"/)?.[1] ||
			"";
		const customUrl = block.match(/"canonicalBaseUrl":"([^"]+)"/)?.[1];

		results.push({
			id: channelId,
			title,
			description,
			thumbnail: normalizeThumbnail(thumbnail),
			customUrl,
		});
	}

	return results;
}

async function searchChannels(query, options = {}) {
	const trimmedQuery = String(query || "").trim();
	if (trimmedQuery.length < 2) return [];

	// Check cache first
	const cached = getCachedResults(trimmedQuery);
	if (cached) return cached;

	const fetchImpl = options.fetchImpl || fetch;
	const limit = options.limit || 8;
	const identity = detectChannelIdentity(trimmedQuery);
	const fallbackQuery = identity ? identity.value : trimmedQuery;

	if (identity) {
		const scrapeResults = await resolveDirectChannelByScrape(identity, {
			fetchImpl,
		});
		if (scrapeResults.length > 0) {
			setCachedResults(trimmedQuery, scrapeResults);
			return scrapeResults;
		}
	}

	const searchQueries = buildChannelSearchQueries(fallbackQuery, 3);
	if (searchQueries.length > 0) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
		try {
			const searchResults = await Promise.all(
				searchQueries.map(async (searchQuery) => {
					const params = new URLSearchParams({
						search_query: searchQuery,
						sp: "EgIQAg==",
					});
					const response = await fetchImpl(
						`https://www.youtube.com/results?${params.toString()}`,
						{
							headers: {
								"User-Agent":
									"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/135 Safari/537.36",
								"Accept-Language": "en-US,en;q=0.9",
							},
							signal: controller.signal,
						},
					);
					if (!response.ok) return [];
					return findYouTubeChannelCandidates(
						extractYouTubeInitialData(await response.text()),
					);
				}),
			);
			const ranked = dedupeAndRankChannels(
				trimmedQuery,
				searchResults.flat(),
				limit,
			);
			if (ranked.length > 0) {
				setCachedResults(trimmedQuery, ranked);
				return ranked;
			}
		} catch (error) {
			if (error.name !== "AbortError") {
				console.warn("YouTube channel discovery failed:", error.message);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}

	const apiResults = await searchYouTubeApiChannels(fallbackQuery, {
		fetchImpl,
		apiKey: options.youtubeApiKey,
	});
	const ranked = dedupeAndRankChannels(trimmedQuery, apiResults, limit, false);
	setCachedResults(trimmedQuery, ranked);
	return ranked;
}

/**
 * Try the configured LLM resolver and return its suggestion.
 * OpenCode big-pickle is the sole LLM tier — it runs function-calling
 * with a custom web_search tool (DDG HTML or Brave backend) and the
 * OPENCODE_API_KEY the user already has.
 *
 * Return shape:
 *   { type: "handle"|"channel_id", value, title?, provider }
 *
 * @param {string} query
 * @param {object} options
 * @param {function} options.fetchImpl
 * @param {string|undefined} options.opencodeKey
 * @param {string|undefined} options.braveKey
 * @returns {Promise<{type,value,title,provider}|null>}
 */
// eslint-disable-next-line no-unused-vars
async function resolveChannelViaLlm(query, options) {
	const fetchImpl = options.fetchImpl || fetch;
	const cfg = options.llmConfig || {};
	const apiKey =
		cfg.apiKey !== undefined
			? cfg.apiKey
			: options.opencodeKey !== undefined
				? options.opencodeKey
				: process.env.OPENCODE_API_KEY;
	if (!apiKey) return null;

	return await resolveChannelViaLlmProvider(query, {
		fetchImpl,
		provider: cfg.provider || "opencode",
		apiKey,
		model: cfg.model,
		endpoint: cfg.endpoint,
		braveKey: options.braveKey,
	});
}

/**
 * Detect whether the query is a direct channel identifier rather than a
 * keyword search.
 *
 * @param {string} query — raw user input
 * @returns {{ type: "channel_id"|"handle"|"custom"|"user", value: string }|null}
 */
function detectChannelIdentity(query) {
	const trimmed = String(query || "").trim();
	if (!trimmed) return null;

	// Channel ID: UCxxxxxxxxxxxxxxxxxxxxxx (24 chars total)
	if (/^UC[\w-]{22}$/.test(trimmed)) {
		return { type: "channel_id", value: trimmed };
	}

	// Handle: @username
	const handleMatch = trimmed.match(/^@([\w.-]+)$/);
	if (handleMatch) {
		return { type: "handle", value: handleMatch[1] };
	}

	// YouTube URL (with or without protocol)
	const parsed = parseYouTubeUrl(trimmed);
	if (parsed) return parsed;

	return null;
}

/**
 * Resolve a direct channel identity via channels.list (1 quota unit)
 * instead of search.list (100 units). Returns full metadata including
 * subscriber and video counts.
 *
 * @param {{ type: string, value: string }} identity
 * @param {object} options
 * @returns {Promise<Array<{id,title,description,thumbnail,customUrl,subscriberCount,videoCount}>>}
 */
/**
 * Resolve a direct channel identity by scraping the YouTube channel page.
 * Used as a fallback when YOUTUBE_API_KEY is not set — the YouTube
 * Data API can't be queried, but the channel page itself contains
 * the channel ID and title in its HTML metadata.
 *
 * Works for:
 *   - channel_id: fetches /channel/UC... and verifies the scraped ID matches
 *   - handle:     fetches /@handle (redirects to /channel/UC...) and extracts ID
 *   - custom:     fetches /c/customname (redirects to /channel/UC...) and extracts ID
 *   - user:       fetches /user/username (redirects to /channel/UC...) and extracts ID
 *
 * @param {{ type: string, value: string }} identity
 * @param {object} options
 * @returns {Promise<Array<{id, title, description, thumbnail, customUrl}>>}
 */
async function resolveDirectChannelByScrape(identity, options = {}) {
	const fetchImpl = options.fetchImpl || fetch;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

	try {
		let pageUrl;
		if (identity.type === "channel_id") {
			pageUrl = `https://www.youtube.com/channel/${identity.value}`;
		} else if (identity.type === "handle") {
			pageUrl = `https://www.youtube.com/@${identity.value}`;
		} else if (identity.type === "custom") {
			pageUrl = `https://www.youtube.com/c/${identity.value}`;
		} else if (identity.type === "user") {
			pageUrl = `https://www.youtube.com/user/${identity.value}`;
		} else {
			return [];
		}

		const response = await fetchImpl(pageUrl, {
			signal: controller.signal,
			headers: {
				// Mobile User-Agent gets a leaner page that still contains
				// the channel ID in the canonical link and og:title meta.
				"User-Agent":
					"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
					"AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 " +
					"Mobile/15E148 Safari/604.1",
				"Accept-Language": "en-US,en;q=0.9",
			},
		});

		if (!response.ok) return [];

		const html = await response.text();
		const { channelId, title, avatar } = extractYouTubeChannelMetadata(html);

		if (!channelId) return [];

		// For channel_id identities, the scraped ID MUST match — otherwise
		// YouTube redirected to a different channel and we'd return a wrong
		// result. For handle/custom/user, the ID comes from the redirect
		// target, so any valid UC... is the right answer.
		if (identity.type === "channel_id" && channelId !== identity.value) {
			return [];
		}

		return [
			{
				id: channelId,
				title: title || "",
				description: "",
				thumbnail: avatar || "",
				customUrl:
					identity.type === "handle" ? `/@${identity.value}` : undefined,
			},
		];
	} catch (error) {
		if (error.name !== "AbortError") {
			console.warn(
				"Direct channel resolution by scrape failed:",
				error.message,
			);
		}
		return [];
	} finally {
		clearTimeout(timeoutId);
	}
}

function getSearchCacheStats() {
	return {
		size: searchCache.size,
		maxEntries: searchCache.maxEntries,
	};
}

/**
 * Clear the in-process search cache. Intended for tests and ops tooling
 * — production code should let entries expire on their own (30s TTL).
 */
function clearSearchCache() {
	searchCache.clear();
}

/**
 * Which search backends are available given the current environment.
 * Useful for the frontend to display status and for debugging.
 */
function getSearchBackendStatus() {
	const { getQuotaStats } = require("./youtube-api-search");
	return {
		youtubeHtml: { available: true },
		youtubeApi: {
			available: Boolean(process.env.YOUTUBE_API_KEY),
			quota: getQuotaStats(),
		},
	};
}

module.exports = {
	buildChannelSearchQueries,
	clearSearchCache,
	dedupeAndRankChannels,
	detectChannelIdentity,
	getMeaningfulSearchText,
	getMeaningfulTokens,
	getSearchBackendStatus,
	getSearchCacheStats,
	parseYouTubeChannelSearchResults,
	resolveDirectChannelByScrape,
	scoreChannelResult,
	searchChannels,
};
