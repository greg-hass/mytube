const {
	pipedInstances: PIPED_INSTANCES,
	invidiousInstances: INVIDIOUS_INSTANCES,
} = require("./external-services.json");
const { createLruCache } = require("./utils");
const { searchYouTubeApiChannels } = require("./youtube-api-search");
const {
	searchBraveChannels,
	parseYouTubeUrl,
} = require("./brave-channel-search");
const { extractYouTubeChannelMetadata } = require("./youtube-html-parser");
const {
	resolveChannelViaOpencode,
	getOpencodeBackendStatus,
} = require("./opencode-channel-resolver");

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

async function searchPipedChannels(
	query,
	fetchImpl = fetch,
	signal,
	maxInstances = 2,
) {
	const instances = PIPED_INSTANCES.slice(0, maxInstances);
	const searches = instances.map(async (instance) => {
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
				videoCount: item.videos ? String(item.videos) : undefined,
			}));
		} catch (error) {
			console.warn(`Channel search failed for ${instance}:`, error.message);
			return [];
		}
	});

	const results = await Promise.all(searches);
	return results.flat();
}

async function searchInvidiousChannels(
	query,
	fetchImpl = fetch,
	signal,
	maxInstances = 2,
) {
	const instances = INVIDIOUS_INSTANCES.slice(0, maxInstances);
	const searches = instances.map(async (instance) => {
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
				videoCount: item.videoCount ? String(item.videoCount) : undefined,
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

	// ── Tier 0: Direct identifier resolution ──
	// Channel IDs, @handles, and YouTube URLs are resolved exactly via
	// channels.list (1 quota unit) instead of search.list (100 units).
	const identity = detectChannelIdentity(trimmedQuery);
	const fallbackQuery = identity ? identity.value : trimmedQuery;
	if (identity) {
		const directResults = await resolveDirectChannel(identity, {
			fetchImpl,
			apiKey: options.youtubeApiKey,
		});
		if (directResults.length > 0) {
			setCachedResults(trimmedQuery, directResults);
			return directResults;
		}

		// Direct resolution via API failed (no YOUTUBE_API_KEY, or the
		// handle/ID didn't match). Try scraping the YouTube channel page
		// directly — the page's own metadata always contains the canonical
		// channel ID and title, so this works without any API key.
		const scrapeResults = await resolveDirectChannelByScrape(identity, {
			fetchImpl,
		});
		if (scrapeResults.length > 0) {
			setCachedResults(trimmedQuery, scrapeResults);
			return scrapeResults;
		}
		// Direct resolution failed (no API key, invalid handle) —
		// fall through to keyword/fallback search using the clean identity.
	}

	// ── Tier 0b: Concatenated handle fallback ──
	// "mario nawfal" (typed as two words) likely means the handle
	// `@marionawfal`. The keyword backends often miss person-name
	// queries with a space, so try the concatenated handle directly.
	// Capped at 3s so invalid handles don't block the search.
	if (!identity && trimmedQuery.length >= 4) {
		const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
		if (tokens.length >= 2 && tokens.length <= 4) {
			const concatenated = tokens.join("").replace(/[^a-z0-9]/gi, "");
			if (concatenated.length >= 4) {
				const handleIdentity = { type: "handle", value: concatenated };
				let timeoutHandle;
				const handleResults = await Promise.race([
					resolveDirectChannelByScrape(handleIdentity, { fetchImpl }),
					new Promise((resolve) => {
						timeoutHandle = setTimeout(() => resolve([]), 3000);
					}),
				]).finally(() => clearTimeout(timeoutHandle));
				if (handleResults.length > 0) {
					setCachedResults(trimmedQuery, handleResults);
					return handleResults;
				}
			}
		}
	}

	// ── Tier 1: YouTube Data API keyword search ──
	// Pass the ORIGINAL query — YouTube's search.list handles natural
	// language well. Trust YouTube's ranking: include all results sorted
	// by local score, without filtering out score-0 matches (our local
	// scorer may miss channels YouTube already determined are relevant).
	{
		const apiResults = await searchYouTubeApiChannels(fallbackQuery, {
			fetchImpl,
			apiKey: options.youtubeApiKey,
		});
		if (apiResults.length > 0) {
			const ranked = dedupeAndRankChannels(
				trimmedQuery,
				apiResults,
				limit,
				false,
			);
			if (ranked.length > 0) {
				setCachedResults(trimmedQuery, ranked);
				return ranked;
			}
		}
	}

	// ── Tier 2: Brave Search API ──
	// Queries site:youtube.com, resolves handles via channels.list (1 unit each).
	{
		const braveResults = await searchBraveChannels(fallbackQuery, {
			fetchImpl,
			braveKey: options.braveKey,
			apiKey: options.youtubeApiKey,
		});
		if (braveResults.length > 0) {
			const ranked = dedupeAndRankChannels(trimmedQuery, braveResults, limit);
			if (ranked.length > 0) {
				setCachedResults(trimmedQuery, ranked);
				return ranked;
			}
		}
	}

	// ── Tier 3: YouTube scrape + Piped + Invidious ──
	// Free but less reliable. Generates multiple query variants.
	const searchQueries = buildChannelSearchQueries(fallbackQuery, 3);
	let tier3Ranked = [];
	if (searchQueries.length > 0) {
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
							searchYouTubePageChannels(
								searchQuery,
								fetchImpl,
								controller.signal,
							),
							searchPipedChannels(searchQuery, fetchImpl, controller.signal),
							searchInvidiousChannels(
								searchQuery,
								fetchImpl,
								controller.signal,
							),
						]);

					return [...youtubeResults, ...pipedResults, ...invidiousResults];
				}),
			);
		} finally {
			clearTimeout(timeoutId);
		}

		const allResults = searchResults.flat();
		tier3Ranked = dedupeAndRankChannels(trimmedQuery, allResults, limit);

		if (tier3Ranked.length > 0) {
			setCachedResults(trimmedQuery, tier3Ranked);
			return tier3Ranked;
		}
	}

	// ── Tier 6: LLM-based fuzzy resolver (OpenCode big-pickle) ──
	// The killer feature for keyword queries the static backends miss —
	// e.g. "mario nawfal" (typo) or "nawfal" (single-word) where Brave
	// returns unrelated channels.
	//
	// OpenCode big-pickle — free, function-calling with a custom
	// web_search tool (DDG HTML or Brave backend). Uses the
	// OPENCODE_API_KEY the user already has.
	//
	// The LLM's output is ALWAYS verified by scraping the YouTube page
	// — LLMs hallucinate handles that look right but don't exist. The
	// verification step is what makes this tier safe.
	{
		const llmResult = await resolveChannelViaLlm(fallbackQuery, {
			fetchImpl,
			opencodeKey: options.opencodeKey,
			braveKey: options.braveKey,
		});
		if (llmResult) {
			const verifyIdentity = {
				type: llmResult.type,
				value: llmResult.value,
			};
			const verified = await resolveDirectChannelByScrape(verifyIdentity, {
				fetchImpl,
			});
			if (verified.length > 0) {
				// If the LLM returned a better title than the page scrape
				// picked up, use it. The page scrape occasionally misses the
				// title for non-mobile UAs.
				if (llmResult.title && !verified[0].title) {
					verified[0].title = llmResult.title;
				}
				const ranked = dedupeAndRankChannels(trimmedQuery, verified, limit);
				if (ranked.length > 0) {
					setCachedResults(trimmedQuery, ranked);
					return ranked;
				}
			}
			// LLM's suggestion didn't verify — log for debugging but
			// don't fail loudly (hallucination is expected sometimes).
			console.warn(
				`[${llmResult.provider}-tier] LLM suggested ${llmResult.type}=${llmResult.value} for "${fallbackQuery}" but YouTube page did not verify — skipping`,
			);
		}
	}

	// All tiers exhausted. Cache the empty result so we don't hammer
	// the backends on repeated identical queries.
	setCachedResults(trimmedQuery, []);
	return [];
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
async function resolveChannelViaLlm(query, options) {
	const fetchImpl = options.fetchImpl || fetch;

	const opencodeKey =
		options.opencodeKey !== undefined
			? options.opencodeKey
			: process.env.OPENCODE_API_KEY;
	if (!opencodeKey) return null;

	return await resolveChannelViaOpencode(query, {
		fetchImpl,
		apiKey: opencodeKey,
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
async function resolveDirectChannel(identity, options = {}) {
	const apiKey =
		options.apiKey !== undefined ? options.apiKey : process.env.YOUTUBE_API_KEY;
	if (!apiKey) return [];

	const fetchImpl = options.fetchImpl || fetch;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

	try {
		let queryParam;
		if (identity.type === "channel_id") {
			queryParam = `id=${encodeURIComponent(identity.value)}`;
		} else if (identity.type === "handle") {
			const handle = identity.value.startsWith("@")
				? identity.value
				: `@${identity.value}`;
			queryParam = `forHandle=${encodeURIComponent(handle)}`;
		} else {
			// "custom" and "user" → forUsername
			queryParam = `forUsername=${encodeURIComponent(identity.value)}`;
		}

		const url =
			`https://www.googleapis.com/youtube/v3/channels` +
			`?part=snippet,statistics&${queryParam}&key=${apiKey}`;

		const response = await fetchImpl(url, { signal: controller.signal });
		if (!response.ok) return [];

		const data = await response.json();
		const items = Array.isArray(data?.items) ? data.items : [];

		return items
			.filter((item) => item?.id?.startsWith("UC"))
			.map((item) => ({
				id: item.id,
				title: item.snippet?.title || "",
				description: item.snippet?.description || "",
				thumbnail:
					item.snippet?.thumbnails?.medium?.url ||
					item.snippet?.thumbnails?.default?.url ||
					"",
				customUrl: item.snippet?.customUrl,
				subscriberCount: item.statistics?.subscriberCount,
				videoCount: item.statistics?.videoCount,
			}));
	} catch (error) {
		if (error.name !== "AbortError") {
			console.warn("Direct channel resolution failed:", error.message);
		}
		return [];
	} finally {
		clearTimeout(timeoutId);
	}
}

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
		youtubeApi: {
			available: Boolean(process.env.YOUTUBE_API_KEY),
			quota: getQuotaStats(),
		},
		brave: {
			available: Boolean(process.env.BRAVE_API_KEY),
		},
		scrape: { available: true },
		opencode: getOpencodeBackendStatus(),
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
	resolveDirectChannel,
	resolveDirectChannelByScrape,
	scoreChannelResult,
	searchChannels,
};
