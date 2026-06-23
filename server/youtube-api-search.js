// YouTube Data API v3 search.list with type=channel.
// Primary channel discovery backend — returns channel IDs + metadata directly.
//
// Quota: 100 search.list calls/day (YouTube's own quota bucket).
// We cap at 95 to leave a small safety buffer. The counter resets at
// midnight Pacific Time (when YouTube resets its quota).
//
// If quota is exhausted or the API returns 403, this module returns []
// so the search orchestrator falls through to Brave / scrape backends.

const SEARCH_LIST_QUOTA_LIMIT = 95;
const SEARCH_LIST_MAX_RESULTS = 25;
const SEARCH_TIMEOUT_MS = 8000;

// In-memory daily quota tracking.
// Approximate — the real source of truth is YouTube's 403 response.
let searchListCallsToday = 0;
let quotaDate = "";
let quotaExhausted = false;

function getPacificDate() {
	return new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Los_Angeles",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

function maybeResetQuota() {
	const today = getPacificDate();
	if (today !== quotaDate) {
		quotaDate = today;
		searchListCallsToday = 0;
		quotaExhausted = false;
	}
}

function getQuotaStats() {
	maybeResetQuota();
	return {
		searchListCallsToday,
		searchListLimit: SEARCH_LIST_QUOTA_LIMIT,
		quotaExhausted,
		quotaDate,
	};
}

function isQuotaAvailable() {
	maybeResetQuota();
	return !quotaExhausted && searchListCallsToday < SEARCH_LIST_QUOTA_LIMIT;
}

function markQuotaExhausted() {
	quotaExhausted = true;
}

// Test helper — reset quota state.
function resetQuotaForTesting() {
	searchListCallsToday = 0;
	quotaExhausted = false;
	quotaDate = getPacificDate();
}

/**
 * Search for channels using YouTube Data API v3 search.list.
 *
 * @param {string} query — the meaningful search query (e.g. "woodworking")
 * @param {object} options
 * @param {string} [options.apiKey] — override process.env.YOUTUBE_API_KEY
 * @param {function} [options.fetchImpl] — override global fetch (for tests)
 * @returns {Promise<Array<{id, title, description, thumbnail, customUrl}>>}
 */
async function searchYouTubeApiChannels(query, options = {}) {
	const apiKey =
		options.apiKey !== undefined ? options.apiKey : process.env.YOUTUBE_API_KEY;
	if (!apiKey || !isQuotaAvailable()) return [];

	const fetchImpl = options.fetchImpl || fetch;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

	// Count the call before sending — YouTube charges even for failed requests.
	searchListCallsToday += 1;

	try {
		const url =
			`https://www.googleapis.com/youtube/v3/search` +
			`?part=snippet&type=channel` +
			`&maxResults=${SEARCH_LIST_MAX_RESULTS}` +
			`&q=${encodeURIComponent(query)}` +
			`&key=${apiKey}`;

		const response = await fetchImpl(url, { signal: controller.signal });

		if (response.status === 403) {
			markQuotaExhausted();
			console.warn(
				"⚠️ YouTube API search quota exceeded — falling back to Brave/scrape",
			);
			return [];
		}

		if (!response.ok) return [];

		const data = await response.json();
		const items = Array.isArray(data?.items) ? data.items : [];

		return items
			.filter((item) => item?.id?.channelId?.startsWith("UC"))
			.map((item) => ({
				id: item.id.channelId,
				title: item.snippet?.title || "",
				description: item.snippet?.description || "",
				thumbnail:
					item.snippet?.thumbnails?.medium?.url ||
					item.snippet?.thumbnails?.default?.url ||
					"",
				// search.list snippet doesn't include customUrl
				customUrl: undefined,
			}));
	} catch (error) {
		if (error.name === "AbortError") {
			console.warn("YouTube API search timed out");
		} else {
			console.warn("YouTube API channel search failed:", error.message);
		}
		return [];
	} finally {
		clearTimeout(timeoutId);
	}
}

module.exports = {
	searchYouTubeApiChannels,
	getQuotaStats,
	isQuotaAvailable,
	markQuotaExhausted,
	resetQuotaForTesting,
};
