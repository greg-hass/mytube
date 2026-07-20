/**
 * innertube-fetcher.js — Fetch YouTube subscription feed via InnerTube API.
 *
 * Uses the private /youtubei/v1/browse endpoint with browseId "FEsubscriptions"
 * to retrieve all subscription feed videos in a single API call, replacing
 * per-channel RSS polling when InnerTube credentials are available.
 *
 * Auth: YOUTUBE_INNERTUBE_COOKIE + YOUTUBE_INNERTUBE_SAPISID env vars.
 * If either is missing, isInnerTubeAvailable() returns false and the caller
 * falls back to RSS.
 *
 * The SAPISIDHASH authorization header is computed fresh on every request
 * using the SAPISID cookie value and the current timestamp, since YouTube
 * rejects stale SAPISIDHASH tokens.
 *
 * The returned video objects match the shape used by feed-fetcher.js so they
 * can be merged directly into the existing feed pipeline.
 */

const { createHash } = require("node:crypto");

const { getHighResolutionVideoThumbnail } = require("./video-thumbnails");
const {
	getTextValue,
	getBestThumbnailUrl,
	parseRelativePublishedAt,
	walkYouTubeRenderers,
} = require("./feed-fetcher");

const INNERTUBE_BASE_URL = "https://www.youtube.com/youtubei/v1/browse";
const SUBSCRIPTIONS_BROWSE_ID = "FEsubscriptions";
const MAX_SUBSCRIPTION_VIDEOS = 200;

/**
 * Build a minimal InnerTube client context.
 * YouTube accepts a stripped-down context — the full device fingerprint
 * from the browser is not required.
 */
function buildContext(clientVersion = "2.20260715.04.00") {
	return {
		client: {
			hl: process.env.YOUTUBE_INNERTUBE_HL || "en-GB",
			gl: process.env.YOUTUBE_INNERTUBE_GL || "GB",
			clientName: "WEB",
			clientVersion,
			platform: "DESKTOP",
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
				"AppleWebKit/537.36 (KHTML, like Gecko) " +
				"Chrome/150.0.0.0 Safari/537.36",
			originalUrl: "https://www.youtube.com/feed/subscriptions",
		},
		user: { lockedSafetyMode: false },
		request: { useSsl: true },
	};
}

/**
 * Extract a named cookie value from the cookie string.
 */
function extractCookieValue(cookie, name) {
	const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
	return match ? match[1] : null;
}

/**
 * Extract SAPISID value from the cookie string.
 */
function extractSapisid(cookie) {
	return (
		extractCookieValue(cookie, "SAPISID") ||
		extractCookieValue(cookie, "__Secure-3PAPISID")
	);
}

const YOUTUBE_ORIGIN = "https://www.youtube.com";

/**
 * Get the InnerTube credentials from env vars or the refresh output file.
 */
function getInnerTubeCredentials() {
	if (process.env.YOUTUBE_INNERTUBE_COOKIE) {
		return { cookieString: process.env.YOUTUBE_INNERTUBE_COOKIE };
	}
	try {
		const path = require("node:path");
		const fs = require("node:fs");
		const credsPath = path.join(__dirname, "data", "innertube-creds.json");
		if (fs.existsSync(credsPath)) {
			const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
			const cookieString = creds.cookieString || creds.cookie;
			return cookieString ? { ...creds, cookieString } : null;
		}
	} catch {
		// ignore file read errors
	}
	return null;
}

function getInnerTubeCookie() {
	return getInnerTubeCredentials()?.cookieString || null;
}

/**
 * Compute a single SAPISIDHASH variant.
 * Format: <scheme> <timestamp>_<sha1(timestamp + " " + cookieValue + " " + origin)>_u
 */
function computeHash(
	scheme,
	cookieValue,
	origin = YOUTUBE_ORIGIN,
	hashSuffix = "_u",
) {
	const timestamp = Math.floor(Date.now() / 1000);
	const hash = createHash("sha1")
		.update(`${timestamp} ${cookieValue} ${origin}`)
		.digest("hex");
	return `${scheme} ${timestamp}_${hash}${hashSuffix}`;
}

/**
 * Compute the full Authorization header with all three SAPISID hash variants.
 * YouTube requires SAPISIDHASH, SAPISID1PHASH, and SAPISID3PHASH joined by spaces.
 */
function computeAuthorizationHeader(cookie, authConfig = {}) {
	const suffix = authConfig.hashSuffix ?? "_u";
	const useCombined = !authConfig.hashVariant?.startsWith("sapisid");
	const parts = [];
	const sapisid = extractCookieValue(cookie, "SAPISID");
	const sapisid1p = extractCookieValue(cookie, "__Secure-1PAPISID");
	const sapisid3p = extractCookieValue(cookie, "__Secure-3PAPISID");

	if (sapisid) {
		parts.push(computeHash("SAPISIDHASH", sapisid, YOUTUBE_ORIGIN, suffix));
	}
	if (useCombined && sapisid1p) {
		parts.push(computeHash("SAPISID1PHASH", sapisid1p, YOUTUBE_ORIGIN, suffix));
	}
	if (useCombined && sapisid3p) {
		parts.push(computeHash("SAPISID3PHASH", sapisid3p, YOUTUBE_ORIGIN, suffix));
	}

	if (parts.length === 0) return null;
	return parts.join(" ");
}

/**
 * Build the full set of headers required for authenticated InnerTube requests.
 */
function buildAuthHeaders(cookie, authConfig = {}) {
	const auth = computeAuthorizationHeader(cookie, authConfig);
	if (!auth) return null;
	return {
		"Content-Type": "application/json",
		Cookie: cookie,
		Authorization: auth,
		Origin: YOUTUBE_ORIGIN,
		"X-Origin": YOUTUBE_ORIGIN,
		Referer: `${YOUTUBE_ORIGIN}/feed/subscriptions`,
		"X-Goog-AuthUser": authConfig.authUser || "0",
		"X-Youtube-Client-Name": "1",
		"X-Youtube-Client-Version": authConfig.clientVersion || "2.20260715.04.00",
		"User-Agent":
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
			"AppleWebKit/537.36 (KHTML, like Gecko) " +
			"Chrome/150.0.0.0 Safari/537.36",
		"Accept-Language": "en-US,en;q=0.9",
	};
}

/**
 * Check whether InnerTube credentials are configured.
 */
function isInnerTubeAvailable() {
	const cookie = getInnerTubeCookie();
	return Boolean(cookie && extractSapisid(cookie));
}

/**
 * Parse a human-readable duration string ("10:30", "1:02:15") into seconds.
 */
function parseDurationString(text) {
	if (!text) return null;
	const parts = text.split(":").map(Number);
	if (parts.some(Number.isNaN)) return null;
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	if (parts.length === 1) return parts[0];
	return null;
}

function getLockupChannelMetadata(lockup) {
	const rows =
		lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
			?.metadataRows || [];
	const channelPart = rows[0]?.metadataParts?.[0]?.text;
	const channelTitle = channelPart?.content || "Unknown";
	const commandRun = channelPart?.commandRuns?.[0];
	const channelId =
		commandRun?.onTap?.innertubeCommand?.browseEndpoint?.browseId || "";
	return { channelTitle, channelId };
}

function getLockupPublishedText(lockup) {
	const rows =
		lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel
			?.metadataRows || [];
	for (let i = 1; i < rows.length; i += 1) {
		const parts = rows[i].metadataParts || [];
		for (const part of parts) {
			const text = part.text?.content || "";
			if (
				/\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.test(text)
			) {
				return text;
			}
		}
	}
	return null;
}

function getLockupDuration(lockup) {
	const overlays = lockup.contentImage?.thumbnailViewModel?.overlays || [];
	for (const overlay of overlays) {
		const badge =
			overlay.thumbnailBottomOverlayViewModel?.badges?.[0]
				?.thumbnailBadgeViewModel;
		if (!badge) continue;
		if (badge.badgeStyle === "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE") {
			return null;
		}
		return parseDurationString(badge.text);
	}
	return null;
}

function getLockupThumbnail(lockup) {
	const sources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
	return getBestThumbnailUrl(sources);
}

/**
 * Parse a new-style lockup view model (richItemRenderer content) into MyTube's video format.
 */
function parseLockupViewModel(lockup, { now = Date.now() } = {}) {
	if (
		!lockup?.contentId ||
		lockup.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO"
	) {
		return null;
	}

	const title =
		lockup.metadata?.lockupMetadataViewModel?.title?.content || "Untitled";
	const publishedText = getLockupPublishedText(lockup);
	const publishedAt = parseRelativePublishedAt(publishedText, now);
	if (!publishedAt) return null;

	const { channelId, channelTitle } = getLockupChannelMetadata(lockup);
	const duration = getLockupDuration(lockup);
	const thumbnail = getHighResolutionVideoThumbnail(
		getLockupThumbnail(lockup),
		lockup.contentId,
	);

	const video = {
		id: lockup.contentId,
		title,
		channelId,
		channelTitle,
		publishedAt,
		thumbnail,
		description: "",
		duration,
		fetchedVia: "innertube",
		publishedAtSource: "innertube-relative-time",
	};

	if (duration !== null && duration <= 61) {
		video.isShort = true;
	}

	return video;
}

/**
 * Extract channelId from a video renderer's byline navigation data.
 */
function extractChannelId(renderer) {
	const byline =
		renderer.ownerText || renderer.longBylineText || renderer.shortBylineText;
	if (!byline?.runs) return null;

	for (const run of byline.runs) {
		const browseId = run.navigationEndpoint?.browseEndpoint?.browseId;
		if (browseId?.startsWith("UC")) return browseId;
	}
	return null;
}

/**
 * Extract channel title from a video renderer's byline.
 */
function extractChannelTitle(renderer) {
	const byline =
		renderer.ownerText || renderer.longBylineText || renderer.shortBylineText;
	return getTextValue(byline) || "Unknown";
}

/**
 * Parse a single video renderer into MyTube's video object format.
 */
function parseVideoRenderer(renderer, { now = Date.now() } = {}) {
	if (!renderer?.videoId) return null;

	const title = getTextValue(renderer.title) || "Untitled";
	const publishedText = getTextValue(renderer.publishedTimeText);
	const publishedAt = parseRelativePublishedAt(publishedText, now);
	if (!publishedAt) return null;

	const channelId = extractChannelId(renderer);
	const channelTitle = extractChannelTitle(renderer);
	const durationText = getTextValue(renderer.lengthText);
	const duration = parseDurationString(durationText);
	const description = getTextValue(renderer.descriptionSnippet);
	const thumbnail = getHighResolutionVideoThumbnail(
		getBestThumbnailUrl(renderer.thumbnail?.thumbnails),
		renderer.videoId,
	);

	const video = {
		id: renderer.videoId,
		title,
		channelId: channelId || "",
		channelTitle,
		publishedAt,
		thumbnail,
		description: description || "",
		duration,
		fetchedVia: "innertube",
		publishedAtSource: "innertube-relative-time",
	};

	if (duration !== null && duration <= 61) {
		video.isShort = true;
	}

	return video;
}

/**
 * Extract a continuation token from the InnerTube response (for pagination).
 */
function extractContinuationToken(responseData) {
	const continuations = [];
	walkYouTubeRenderers(responseData, (node) => {
		const token =
			node.continuationItemRenderer?.continuationEndpoint?.continuationCommand
				?.token ||
			node.continuationItemRenderer?.button?.buttonRenderer?.command
				?.continuationCommand?.token;
		if (token) continuations.push(token);
	});
	return continuations[0] || null;
}

/**
 * Walk the InnerTube response tree and extract all video renderers.
 */
function extractVideosFromResponse(responseData, { now = Date.now() } = {}) {
	const videos = [];
	const seen = new Set();

	walkYouTubeRenderers(responseData, (node) => {
		const renderer = node.videoRenderer || node.gridVideoRenderer;
		if (renderer?.videoId && !seen.has(renderer.videoId)) {
			seen.add(renderer.videoId);
			const video = parseVideoRenderer(renderer, { now });
			if (video) videos.push(video);
			return;
		}

		const lockup = node.richItemRenderer?.content?.lockupViewModel;
		if (lockup?.contentId && !seen.has(lockup.contentId)) {
			seen.add(lockup.contentId);
			const video = parseLockupViewModel(lockup, { now });
			if (video) videos.push(video);
		}
	});

	return videos;
}

/**
 * Build the channel metadata map from extracted videos.
 * Returns { channelId: { title, thumbnail } } for each unique channel.
 */
function buildChannelMetadata(videos) {
	const metadata = {};
	for (const video of videos) {
		if (video.channelId && !metadata[video.channelId]) {
			metadata[video.channelId] = {
				title: video.channelTitle,
				thumbnail: null,
			};
		}
	}
	return metadata;
}

/**
 * Fetch the subscription feed via InnerTube browse endpoint.
 *
 * @param {object} options
 * @param {number} [options.maxVideos=200] - Maximum videos to return.
 * @param {typeof fetch} [options.fetchImpl=fetch] - Fetch implementation (for tests).
 * @param {number} [options.timeoutMs=15000] - Request timeout.
 * @returns {Promise<{videos: Array, channelMetadata: object, source: string, continuationToken: string|null}|null>}
 *   Returns null if InnerTube is not configured or the request fails.
 */
async function fetchSubscriptionFeed(options = {}) {
	if (!isInnerTubeAvailable()) return null;

	const {
		maxVideos = MAX_SUBSCRIPTION_VIDEOS,
		fetchImpl = fetch,
		timeoutMs = 15000,
	} = options;

	const credentials = getInnerTubeCredentials();
	const cookie = credentials?.cookieString;
	const headers = buildAuthHeaders(cookie, credentials || undefined);
	if (!headers) return null;

	const body = {
		context: buildContext(credentials?.clientVersion),
		browseId: SUBSCRIPTIONS_BROWSE_ID,
	};

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetchImpl(
			`${INNERTUBE_BASE_URL}?prettyPrint=false`,
			{
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			},
		);

		if (!response.ok) {
			console.warn(
				`[innertube] Browse endpoint returned HTTP ${response.status}`,
			);
			return null;
		}

		const data = await response.json();
		const videos = extractVideosFromResponse(data).slice(0, maxVideos);
		const channelMetadata = buildChannelMetadata(videos);
		const continuationToken = extractContinuationToken(data);

		console.info(
			`[innertube] Fetched ${videos.length} subscription videos from ${Object.keys(channelMetadata).length} channels`,
		);

		return {
			videos,
			channelMetadata,
			source: "innertube",
			continuationToken,
		};
	} catch (error) {
		if (error.name === "AbortError") {
			console.warn("[innertube] Request timed out");
		} else {
			console.warn(`[innertube] Fetch failed: ${error.message}`);
		}
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Fetch additional pages of the subscription feed using a continuation token.
 *
 * @param {string} continuationToken - Token from a previous fetchSubscriptionFeed call.
 * @param {object} [options] - Same options as fetchSubscriptionFeed.
 * @returns {Promise<object|null>}
 */
async function fetchSubscriptionFeedPage(continuationToken, options = {}) {
	if (!isInnerTubeAvailable() || !continuationToken) return null;

	const { fetchImpl = fetch, timeoutMs = 15000 } = options;
	const credentials = getInnerTubeCredentials();
	const cookie = credentials?.cookieString;
	const headers = buildAuthHeaders(cookie, credentials || undefined);
	if (!headers) return null;

	const body = {
		context: buildContext(credentials?.clientVersion),
		continuation: continuationToken,
	};

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetchImpl(
			`${INNERTUBE_BASE_URL}?prettyPrint=false`,
			{
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: controller.signal,
			},
		);

		if (!response.ok) {
			console.warn(
				`[innertube] Continuation endpoint returned HTTP ${response.status}`,
			);
			return null;
		}

		const data = await response.json();
		const videos = extractVideosFromResponse(data);
		const nextToken = extractContinuationToken(data);

		return {
			videos,
			source: "innertube",
			continuationToken: nextToken,
		};
	} catch (error) {
		console.warn(`[innertube] Continuation fetch failed: ${error.message}`);
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

module.exports = {
	isInnerTubeAvailable,
	fetchSubscriptionFeed,
	fetchSubscriptionFeedPage,
	getInnerTubeCookie,
	getInnerTubeCredentials,
	extractSapisid,
	extractCookieValue,
	computeHash,
	computeAuthorizationHeader,
	buildAuthHeaders,
	parseLockupViewModel,
	extractVideosFromResponse,
	extractContinuationToken,
	parseVideoRenderer,
	parseDurationString,
	extractChannelId,
	extractChannelTitle,
	buildChannelMetadata,
	buildContext,
	MAX_SUBSCRIPTION_VIDEOS,
	SUBSCRIPTIONS_BROWSE_ID,
};
