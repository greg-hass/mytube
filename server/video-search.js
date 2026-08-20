// Video search for the Add Channel modal's "Videos" mode.
//
// Finds the latest YouTube videos whose titles contain the search words,
// by scraping the public results page with the `intitle:` operator and the
// upload-date sort filter (sp=CAISAhAB → sort by upload date, type video).
// No InnerTube client and no API key — the results page needs no auth, so
// there is no client-version churn and no quota burn.
//
// Each result carries the video's channel id/title so the frontend can
// offer the channel for subscription via the existing channel-search flow.

const { createLruCache } = require("./utils");
const {
	getBestThumbnailUrl,
	getTextValue,
	parseRelativePublishedAt,
	parseYtInitialData,
	walkYouTubeRenderers,
} = require("./feed-fetcher");
const { getHighResolutionVideoThumbnail } = require("./video-thumbnails");

const VIDEO_SEARCH_TIMEOUT_MS = 8000;
const VIDEO_SEARCH_CACHE_MS = 30000;
const VIDEO_SEARCH_CACHE_MAX_ENTRIES = 100;
const VIDEO_SEARCH_MAX_LIMIT = 20;

const SEARCH_RESULTS_URL = "https://www.youtube.com/results";
// sp=CAISAhAB → protobuf { sort: 3 (upload date), filter: { type: 1 (video) } }.
const UPLOAD_DATE_VIDEO_FILTER = "CAISAhAB";

const videoSearchCache = createLruCache({
	maxEntries: VIDEO_SEARCH_CACHE_MAX_ENTRIES,
});

function normalizeQuery(query) {
	return String(query || "")
		.trim()
		.replace(/\s+/g, " ");
}

function getCacheKey(query) {
	return normalizeQuery(query).toLowerCase();
}

function getCachedResults(query) {
	const cached = videoSearchCache.get(getCacheKey(query));
	if (cached && Date.now() - cached.timestamp < VIDEO_SEARCH_CACHE_MS) {
		return cached.results;
	}
	return null;
}

function setCachedResults(query, results) {
	videoSearchCache.set(getCacheKey(query), { results, timestamp: Date.now() });
}

function extractChannelId(renderer) {
	return (
		renderer.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ||
		renderer.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
			?.browseId ||
		renderer.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
			?.browseId ||
		""
	);
}

function extractChannelTitle(renderer) {
	return (
		getTextValue(renderer.ownerText) ||
		getTextValue(renderer.shortBylineText) ||
		getTextValue(renderer.longBylineText) ||
		""
	);
}

function parseDurationText(text) {
	const value = String(text || "").trim();
	if (!value) return null;
	const match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const [, hours, minutes, seconds] = match;
	return Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * Parse one search videoRenderer into the wire shape. Returns null when the
 * renderer is not a real video (ads, placeholders, missing channel info).
 */
function parseSearchVideoRenderer(renderer, { now = Date.now() } = {}) {
	if (!renderer?.videoId) return null;

	const channelId = extractChannelId(renderer);
	if (!channelId || !channelId.startsWith("UC")) return null;

	const title = getTextValue(renderer.title) || "Untitled";
	const publishedText = getTextValue(renderer.publishedTimeText);
	const publishedAt = parseRelativePublishedAt(publishedText, now);
	if (!publishedAt) return null;

	const duration = parseDurationText(getTextValue(renderer.lengthText));

	return {
		id: renderer.videoId,
		title,
		channelId,
		channelTitle: extractChannelTitle(renderer),
		publishedAt,
		publishedText,
		duration,
		thumbnail: getHighResolutionVideoThumbnail(
			getBestThumbnailUrl(renderer.thumbnail?.thumbnails),
			renderer.videoId,
		),
		description: getTextValue(renderer.descriptionSnippet) || "",
		isShort: duration !== null && duration <= 61,
	};
}

/**
 * Keep only videos whose title contains every meaningful query token.
 * `intitle:` already enforces this server-side on YouTube's end; the local
 * re-check guards against the results page drifting (e.g. related shelves
 * leaking into the payload).
 */
function titleMatchesQuery(title, query) {
	const normalizedTitle = title.toLowerCase();
	return normalizeQuery(query)
		.toLowerCase()
		.split(" ")
		.filter(Boolean)
		.every((token) => normalizedTitle.includes(token));
}

function extractSearchVideos(initialData, query, { limit, now } = {}) {
	const videos = [];
	const seen = new Set();

	walkYouTubeRenderers(initialData, (node) => {
		if (videos.length >= limit) return;
		const renderer = node.videoRenderer;
		if (!renderer?.videoId || seen.has(renderer.videoId)) return;
		seen.add(renderer.videoId);
		const video = parseSearchVideoRenderer(renderer, { now });
		if (video && titleMatchesQuery(video.title, query)) videos.push(video);
	});

	return videos;
}

/**
 * Search for the latest videos with the query words in the title.
 * Returns { results, source } — source is "scrape". Empty results when the
 * query is too short or nothing matches; never throws for expected failures.
 */
async function searchVideos(query, options = {}) {
	const normalizedQuery = normalizeQuery(query);
	if (normalizedQuery.length < 2) return { results: [], source: "scrape" };

	const cached = getCachedResults(normalizedQuery);
	if (cached) return { results: cached, source: "cache" };

	const limit = Math.min(
		Math.max(Number(options.limit) || 12, 1),
		VIDEO_SEARCH_MAX_LIMIT,
	);
	const fetchImpl = options.fetchImpl || fetch;

	const params = new URLSearchParams({
		search_query: `intitle:${normalizedQuery}`,
		sp: UPLOAD_DATE_VIDEO_FILTER,
	});

	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		VIDEO_SEARCH_TIMEOUT_MS,
	);

	try {
		const response = await fetchImpl(
			`${SEARCH_RESULTS_URL}?${params.toString()}`,
			{
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
						"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
					"Accept-Language": "en-US,en;q=0.9",
				},
				signal: controller.signal,
			},
		);
		if (!response.ok) {
			console.warn(`[video-search] Results page returned HTTP ${response.status}`);
			return { results: [], source: "scrape" };
		}

		const initialData = parseYtInitialData(await response.text());
		if (!initialData) {
			console.warn("[video-search] No ytInitialData in results page");
			return { results: [], source: "scrape" };
		}

		const results = extractSearchVideos(initialData, normalizedQuery, {
			limit,
			now: options.now,
		});
		setCachedResults(normalizedQuery, results);
		return { results, source: "scrape" };
	} catch (error) {
		if (error.name !== "AbortError") {
			console.warn(`[video-search] Search failed: ${error.message}`);
		}
		return { results: [], source: "scrape" };
	} finally {
		clearTimeout(timeoutId);
	}
}

function clearVideoSearchCache() {
	videoSearchCache.clear?.();
}

module.exports = {
	searchVideos,
	extractSearchVideos,
	parseSearchVideoRenderer,
	titleMatchesQuery,
	clearVideoSearchCache,
};
