const { extractBalancedJson, getBestThumbnailUrl } = require("./feed-fetcher");

const YOUTUBE_ORIGIN = "https://www.youtube.com";
const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_ERROR_CACHE_TTL_MS = 10 * 1000;
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_CONCURRENCY = 6;
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

function extractPlayerResponse(html) {
	const source = String(html || "");
	const markerIndex = source.indexOf("ytInitialPlayerResponse");
	if (markerIndex === -1) return null;

	const objectStart = source.indexOf("{", markerIndex);
	if (objectStart === -1) return null;

	const json = extractBalancedJson(source, objectStart);
	if (!json) return null;

	try {
		return JSON.parse(json);
	} catch {
		return null;
	}
}

function extractCanonicalUrl(html) {
	return (
		String(html || "").match(
			/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i,
		)?.[1] || null
	);
}

function parseLiveChannelPage(html, subscription, { now = Date.now() } = {}) {
	const canonicalUrl = extractCanonicalUrl(html);
	if (!canonicalUrl) {
		throw new Error("YouTube returned a page without a canonical URL");
	}

	let canonical;
	try {
		canonical = new URL(canonicalUrl, YOUTUBE_ORIGIN);
	} catch {
		throw new Error("YouTube returned an invalid canonical URL");
	}

	if (canonical.hostname !== "www.youtube.com") {
		throw new Error("YouTube returned an unexpected canonical host");
	}

	if (canonical.pathname !== "/watch") return null;

	const canonicalVideoId = canonical.searchParams.get("v");
	const playerResponse = extractPlayerResponse(html);
	if (!canonicalVideoId || !playerResponse) {
		throw new Error("YouTube live player data was unavailable");
	}

	const videoDetails = playerResponse.videoDetails || {};
	const microformat = playerResponse.microformat?.playerMicroformatRenderer || {};
	const liveDetails = microformat.liveBroadcastDetails || {};
	// YouTube currently emits one of two explicit active-live shapes here:
	// watch pages use liveBroadcastDetails.isLiveNow, while /channel/:id/live
	// can return the more compact videoDetails.isLive flag.
	const isLiveNow =
		liveDetails.isLiveNow === true || videoDetails.isLive === true;
	const videoId = videoDetails.videoId || canonicalVideoId;

	if (videoId !== canonicalVideoId) {
		throw new Error("YouTube live player did not match its canonical video");
	}
	if (!isLiveNow) return null;

	return {
		id: videoId,
		title: videoDetails.title || "Live stream",
		description: videoDetails.shortDescription || "",
		thumbnail: getBestThumbnailUrl(videoDetails.thumbnail?.thumbnails),
		channelId: videoDetails.channelId || subscription.id,
		channelTitle: videoDetails.author || subscription.title || "Unknown",
		publishedAt:
			liveDetails.startTimestamp || microformat.publishDate || new Date(now).toISOString(),
		duration: undefined,
		isLive: true,
		liveBroadcastContent: "live",
		viewCount: videoDetails.viewCount || undefined,
	};
}

function createLiveStreamService(options = {}) {
	const {
		fetchImpl = fetch,
		now = Date.now,
		cacheTtlMs = DEFAULT_CACHE_TTL_MS,
		errorCacheTtlMs = DEFAULT_ERROR_CACHE_TTL_MS,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		concurrency = DEFAULT_CONCURRENCY,
	} = options;
	const cache = new Map();
	const inFlight = new Map();

	async function fetchChannel(subscription) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchImpl(
				`${YOUTUBE_ORIGIN}/channel/${encodeURIComponent(subscription.id)}/live`,
				{
					redirect: "follow",
					signal: controller.signal,
					headers: {
						Accept: "text/html,application/xhtml+xml",
						"Accept-Language": "en-GB,en;q=0.9",
						"User-Agent":
							"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
							"AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36",
					},
				},
			);
			if (!response.ok) {
				throw new Error(`YouTube returned HTTP ${response.status}`);
			}
			const html = await response.text();
			return { video: parseLiveChannelPage(html, subscription, { now: now() }) };
		} catch (error) {
			if (error?.name === "AbortError") {
				return { error: "Live-status lookup timed out" };
			}
			return { error: error instanceof Error ? error.message : "Live-status lookup failed" };
		} finally {
			clearTimeout(timeoutId);
		}
	}

	async function lookupChannel(subscription, { force = false } = {}) {
		const cached = cache.get(subscription.id);
		if (!force && cached && cached.expiresAt > now()) return cached.result;

		if (inFlight.has(subscription.id)) return inFlight.get(subscription.id);

		const request = fetchChannel(subscription).then((result) => {
			cache.set(subscription.id, {
				result,
				expiresAt:
					now() + (result.error ? errorCacheTtlMs : cacheTtlMs),
			});
			return result;
		}).finally(() => {
			inFlight.delete(subscription.id);
		});
		inFlight.set(subscription.id, request);
		return request;
	}

	async function scanSubscriptions(subscriptions, { force = false } = {}) {
		const validSubscriptions = subscriptions.filter(
			(subscription) =>
					subscription && CHANNEL_ID_PATTERN.test(String(subscription.id || "")),
		);
		const activeChannelIds = new Set(
			validSubscriptions.map((subscription) => subscription.id),
		);
		for (const cachedChannelId of cache.keys()) {
			if (!activeChannelIds.has(cachedChannelId)) cache.delete(cachedChannelId);
		}
		const results = new Array(validSubscriptions.length);
		let cursor = 0;

		async function worker() {
			while (cursor < validSubscriptions.length) {
				const index = cursor;
				cursor += 1;
				results[index] = await lookupChannel(validSubscriptions[index], { force });
			}
		}

		await Promise.all(
			Array.from(
				{ length: Math.min(Math.max(1, concurrency), validSubscriptions.length) },
				() => worker(),
			),
		);

		const videos = [];
		const failedChannels = [];
		results.forEach((result, index) => {
			if (result?.video) videos.push(result.video);
			if (result?.error) {
				failedChannels.push({
					id: validSubscriptions[index].id,
					title: validSubscriptions[index].title || "Unknown",
					reason: result.error,
				});
			}
		});
		videos.sort(
			(a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0),
		);

		return {
			videos,
			checkedAt: new Date(now()).toISOString(),
			totalChannels: subscriptions.length,
			checkedChannels: validSubscriptions.length - failedChannels.length,
			invalidChannels: subscriptions.length - validSubscriptions.length,
			failedChannels,
		};
	}

	return { scanSubscriptions, lookupChannel, clearCache: () => cache.clear() };
}

module.exports = {
	createLiveStreamService,
	extractCanonicalUrl,
	extractPlayerResponse,
	parseLiveChannelPage,
	CHANNEL_ID_PATTERN,
};
