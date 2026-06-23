const {
	pipedInstances: PIPED_INSTANCES,
	invidiousInstances: INVIDIOUS_INSTANCES,
} = require("./external-services.json");
const { createLruCache } = require("./utils");

const SEARCH_TIMEOUT_MS = 4000;
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
		add(meaningful);                      // "tech review"
		add(`${meaningful} channel`);         // "tech review channel"
		add(meaningfulCompact);               // "techreview"
		add(firstPlusInitial);                // "techr"
		add(`@${firstPlusInitial}`);          // "@techr"
		add(normalized);                      // "best tech review channels"
	} else {
		// Single meaningful token — prioritize it directly.
		add(meaningful);                      // "woodworking"
		add(`${meaningful} channel`);         // "woodworking channel"
		add(normalized);                      // "the best woodworking channels"
	}

	return queries.slice(0, maxQueries);
}

function scoreChannelResult(query, channel) {
	// Rank against the stopword-stripped meaningful query so that
	// "the best woodworking channels" scores a "Woodworking Art" channel
	// highly, instead of losing to channels that merely contain "the".
	const meaningfulQuery = getMeaningfulSearchText(query) || normalizeText(query);
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
	if (title === normalizedQuery || handle === normalizedQuery) return 100;
	if (compactTitle === compactQuery || handle === compactQuery) return 95;
	if (normalizedTitleIdentity && normalizedTitleIdentity === normalizeYouTubeIdentity(query))
		return 92;
	if (title.startsWith(normalizedQuery) || handle.startsWith(normalizedQuery))
		return 85;
	if (title.includes(normalizedQuery) || handle.includes(normalizedQuery))
		return 70;
	if (compactQuery && compactHaystack.includes(compactQuery)) return 68;

	const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
	if (queryTokens.length === 0) return 0;

	const matchedTokens = queryTokens.filter((token) =>
		haystack.includes(token),
	).length;
	const tokenScore = Math.round((matchedTokens / queryTokens.length) * 60);
	const leadingTokenBonus =
		title.startsWith(queryTokens[0]) || handle.startsWith(queryTokens[0])
			? 15
			: 0;

	return tokenScore + leadingTokenBonus;
}

function dedupeAndRankChannels(query, channels, limit = 8) {
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

	return Array.from(byId.values())
		.map((channel) => ({
			...channel,
			score: scoreChannelResult(query, channel),
		}))
		.filter((channel) => channel.score > 0)
		.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
		.slice(0, limit);
}

function normalizeThumbnail(url) {
	if (!url || typeof url !== "string") return "";
	if (url.startsWith("//")) return `https:${url}`;
	return url;
}

async function searchPipedChannels(query, fetchImpl = fetch, signal) {
	const searches = PIPED_INSTANCES.map(async (instance) => {
		try {
			const response = await fetchImpl(
				`${instance}/search?q=${encodeURIComponent(query)}&filter=channels`,
				{
					headers: { "User-Agent": "Mozilla/5.0" },
					signal,
				},
			);

			if (!response.ok) return [];

			const data = await response.json();
			const items = Array.isArray(data?.items) ? data.items : [];

			return items.map((item) => ({
				id: String(item.url || "")
					.split("/")
					.pop(),
				title: item.name,
				description: item.description || "",
				thumbnail: normalizeThumbnail(item.thumbnail),
				customUrl: item.url,
				subscriberCount: item.subscribers
					? String(item.subscribers)
					: undefined,
			}));
		} catch (error) {
			console.warn(`Channel search failed for ${instance}:`, error.message);
			return [];
		}
	});

	const results = await Promise.all(searches);
	return results.flat();
}

async function searchInvidiousChannels(query, fetchImpl = fetch, signal) {
	const searches = INVIDIOUS_INSTANCES.map(async (instance) => {
		try {
			const response = await fetchImpl(
				`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=channel`,
				{
					headers: { "User-Agent": "Mozilla/5.0" },
					signal,
				},
			);

			if (!response.ok) return [];

			const data = await response.json();
			const items = Array.isArray(data) ? data : [];

			return items.map((item) => ({
				id: item.authorId,
				title: item.author,
				description: item.description || "",
				thumbnail: normalizeThumbnail(item.authorThumbnails?.at(-1)?.url),
				customUrl: item.authorUrl,
				subscriberCount: item.subCount ? String(item.subCount) : undefined,
			}));
		} catch (error) {
			console.warn(`Channel search failed for ${instance}:`, error.message);
			return [];
		}
	});

	const results = await Promise.all(searches);
	return results.flat();
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

async function searchYouTubePageChannels(query, fetchImpl = fetch, signal) {
	try {
		const response = await fetchImpl(
			`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%253D%253D`,
			{
				headers: {
					"User-Agent": "Mozilla/5.0",
					"Accept-Language": "en-US,en;q=0.9",
				},
				signal,
			},
		);

		if (!response.ok) return [];

		return parseYouTubeChannelSearchResults(await response.text());
	} catch (error) {
		console.warn("YouTube channel search scrape failed:", error.message);
		return [];
	}
}

async function searchChannels(query, options = {}) {
	const trimmedQuery = String(query || "").trim();
	if (trimmedQuery.length < 2) return [];

	// Check cache first
	const cached = getCachedResults(trimmedQuery);
	if (cached) return cached;

	const fetchImpl = options.fetchImpl || fetch;
	const limit = options.limit || 8;
	const searchQueries = buildChannelSearchQueries(trimmedQuery);

	// AbortController cancels all in-flight requests after the timeout,
	// so slow instances don't keep running in the background.
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

	let searchResults;
	try {
		searchResults = await Promise.all(
			searchQueries.map(async (searchQuery) => {
				const [youtubeResults, pipedResults, invidiousResults] =
					await Promise.all([
						searchYouTubePageChannels(searchQuery, fetchImpl, controller.signal),
						searchPipedChannels(searchQuery, fetchImpl, controller.signal),
						searchInvidiousChannels(searchQuery, fetchImpl, controller.signal),
					]);

				return [...youtubeResults, ...pipedResults, ...invidiousResults];
			}),
		);
	} finally {
		clearTimeout(timeoutId);
	}

	const allResults = searchResults.flat();
	const ranked = dedupeAndRankChannels(trimmedQuery, allResults, limit);

	// Cache the results
	setCachedResults(trimmedQuery, ranked);

	return ranked;
}

function getSearchCacheStats() {
	return {
		size: searchCache.size,
		maxEntries: searchCache.maxEntries,
	};
}

module.exports = {
	buildChannelSearchQueries,
	dedupeAndRankChannels,
	getMeaningfulSearchText,
	getMeaningfulTokens,
	getSearchCacheStats,
	parseYouTubeChannelSearchResults,
	scoreChannelResult,
	searchChannels,
};
