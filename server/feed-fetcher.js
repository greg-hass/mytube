const Parser = require("rss-parser");
const axios = require("axios");
const { createHash } = require("node:crypto");
const { getHighResolutionVideoThumbnail } = require("./video-thumbnails");

const FEED_FETCH_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const UPLOADS_PLAYLIST_FETCH_LIMIT = 15;

const parser = new Parser({
	timeout: 10000,
	headers: {
		"User-Agent": "Mozilla/5.0 (compatible; RSS Reader/1.0)",
	},
	customFields: {
		item: [
			["media:group", "mediaGroup"],
			["yt:videoId", "ytVideoId"],
			["yt:channelId", "ytChannelId"],
		],
	},
});

function parseDuration(duration) {
	if (!duration) return 0;
	const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;
	const hours = parseInt(match[1]) || 0;
	const minutes = parseInt(match[2]) || 0;
	const seconds = parseInt(match[3]) || 0;
	return hours * 3600 + minutes * 60 + seconds;
}

function getHttpStatusFromError(error) {
	if (Number.isInteger(error?.statusCode)) return error.statusCode;
	if (Number.isInteger(error?.status)) return error.status;
	if (Number.isInteger(error?.response?.status)) return error.response.status;

	const match = String(error?.message || "").match(
		/\bstatus code\s+(\d{3})\b/i,
	);
	return match ? Number(match[1]) : null;
}

function getFirstMediaValue(value) {
	if (Array.isArray(value)) return value[0];
	return value;
}

function getMediaAttribute(value, attributeName) {
	const entry = getFirstMediaValue(value);
	return entry?.$?.[attributeName] || entry?.[attributeName];
}

function getTextValue(value) {
	if (!value) return "";
	if (typeof value === "string") return value;
	if (typeof value.simpleText === "string") return value.simpleText;
	if (Array.isArray(value.runs)) {
		return value.runs.map((run) => run.text || "").join("");
	}
	return "";
}

function getBestThumbnailUrl(thumbnails = []) {
	if (!Array.isArray(thumbnails) || thumbnails.length === 0) return "";
	const sorted = [...thumbnails].sort(
		(a, b) => (b.width || 0) - (a.width || 0),
	);
	const url = sorted[0]?.url || "";
	if (url.startsWith("//")) return `https:${url}`;
	return url.replace(/\\u0026/g, "&");
}

function parseRelativePublishedAt(text, now = Date.now()) {
	const normalized = String(text || "")
		.trim()
		.toLowerCase();
	if (!normalized) return null;
	if (normalized === "yesterday")
		return new Date(now - 24 * 60 * 60 * 1000).toISOString();

	const match = normalized.match(
		/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/,
	);
	if (!match) return null;

	const amount = Number(match[1]);
	const multipliers = {
		second: 1000,
		minute: 60 * 1000,
		hour: 60 * 60 * 1000,
		day: 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		month: 30 * 24 * 60 * 60 * 1000,
		year: 365 * 24 * 60 * 60 * 1000,
	};

	return new Date(now - amount * multipliers[match[2]]).toISOString();
}

function extractBalancedJson(source, startIndex) {
	let depth = 0;
	let inString = false;
	let escape = false;

	for (let i = startIndex; i < source.length; i += 1) {
		const char = source[i];

		if (escape) {
			escape = false;
			continue;
		}

		if (char === "\\") {
			escape = true;
			continue;
		}

		if (char === '"') {
			inString = !inString;
			continue;
		}

		if (inString) continue;

		if (char === "{") depth += 1;
		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				return source.slice(startIndex, i + 1);
			}
		}
	}

	return null;
}

function parseYtInitialData(html) {
	const source = String(html || "");
	const markerIndex = source.indexOf("ytInitialData");
	if (markerIndex === -1) return null;

	const objectStart = source.indexOf("{", markerIndex);
	if (objectStart === -1) return null;

	const json = extractBalancedJson(source, objectStart);
	if (!json) return null;

	try {
		return JSON.parse(json);
	} catch (_error) {
		return null;
	}
}

function walkYouTubeRenderers(value, visitor) {
	if (!value || typeof value !== "object") return;
	visitor(value);

	if (Array.isArray(value)) {
		value.forEach((item) => walkYouTubeRenderers(item, visitor));
		return;
	}

	Object.values(value).forEach((item) => walkYouTubeRenderers(item, visitor));
}

function parseUploadsPlaylistVideos(
	html,
	{ channelId, now = Date.now() } = {},
) {
	const initialData = parseYtInitialData(html);
	if (!initialData) return { videos: [], title: null };

	const playlistTitle = getTextValue(
		initialData.metadata?.playlistMetadataRenderer?.title,
	)
		.replace(/\s+-\s+Videos$/i, "")
		.trim();
	const videos = [];
	const seenVideoIds = new Set();

	walkYouTubeRenderers(initialData, (node) => {
		const renderer =
			node.playlistVideoRenderer ||
			node.gridVideoRenderer ||
			node.videoRenderer;
		if (!renderer?.videoId || seenVideoIds.has(renderer.videoId)) return;

		seenVideoIds.add(renderer.videoId);
		const title = getTextValue(renderer.title) || "Untitled";
		const publishedText = getTextValue(renderer.publishedTimeText);
		const publishedAt = parseRelativePublishedAt(publishedText, now);
		if (!publishedAt) return;

		const thumbnail = getHighResolutionVideoThumbnail(
			getBestThumbnailUrl(renderer.thumbnail?.thumbnails),
			renderer.videoId,
		);

		videos.push({
			id: renderer.videoId,
			title,
			channelId,
			channelTitle: playlistTitle || "Unknown",
			publishedAt,
			thumbnail,
			description: "",
			duration: null,
			fetchedVia: "youtube-page-fallback",
			publishedAtSource: "youtube-relative-time",
		});
	});

	return {
		videos: videos.slice(0, UPLOADS_PLAYLIST_FETCH_LIMIT),
		title: playlistTitle || null,
	};
}

function buildVideoFromFeedItem(item, { channelId, channelTitle }) {
	const videoId = item.id?.split(":").pop() || item.guid;
	const mediaGroup = item.mediaGroup || item["media:group"] || {};
	const mediaDescription = getFirstMediaValue(mediaGroup["media:description"]);
	const mediaThumbnailUrl = getMediaAttribute(
		mediaGroup["media:thumbnail"],
		"url",
	);
	const durationSeconds = getMediaAttribute(
		mediaGroup["yt:duration"],
		"seconds",
	);
	const duration = durationSeconds ? parseInt(durationSeconds, 10) : null;
	const looksLikeShort =
		/#shorts?\b|#ytshorts?\b|#fyp\b|\bshorts\b|youtube\.com\/shorts\//i.test(
			`${item.title || ""} ${mediaDescription || ""}`,
		);

	const video = {
		id: videoId,
		title: item.title,
		channelId: channelId,
		channelTitle,
		publishedAt: item.pubDate || item.isoDate,
		thumbnail: getHighResolutionVideoThumbnail(
			item.media?.thumbnail?.[0]?.url ||
				mediaThumbnailUrl ||
				item.enclosure?.url,
			videoId,
			{ isShort: looksLikeShort },
		),
		description: item.contentSnippet || item.content || mediaDescription || "",
		duration: Number.isFinite(duration) ? duration : null,
	};

	if (looksLikeShort) {
		video.isShort = true;
	}

	return video;
}

async function fetchUploadsPlaylistFeed(
	channelId,
	httpClient = axios,
	options = {},
) {
	if (!channelId?.startsWith("UC")) {
		return { videos: [], channelMetadata: null };
	}

	const uploadsPlaylistId = `UU${channelId.slice(2)}`;
	const url = `https://www.youtube.com/playlist?list=${uploadsPlaylistId}`;
	const response = await httpClient.get(url, {
		headers: {
			"User-Agent": "Mozilla/5.0",
			"Accept-Language": "en-US,en;q=0.9",
		},
		timeout: options.timeout || 10000,
	});

	const { videos, title } = parseUploadsPlaylistVideos(response.data, {
		channelId,
		now: options.now,
	});

	if (title) {
		videos.forEach((video) => {
			video.channelTitle = title;
		});
	}

	return {
		videos,
		channelMetadata: title ? { title, thumbnail: null } : null,
	};
}

function createVideoItemHash(videos) {
	const ids = [];
	const seen = new Set();
	for (const video of videos || []) {
		if (!video?.id || seen.has(video.id)) continue;
		seen.add(video.id);
		ids.push(video.id);
	}
	return createHash("sha256").update(ids.join("\n")).digest("hex");
}

function classifyFeedFailure(error) {
	const status = getHttpStatusFromError(error);
	if (status === null || FEED_FETCH_RETRY_STATUSES.has(status)) {
		return "transient-failure";
	}
	return "permanent-failure";
}

async function fetchYouTubeApiVideos(
	channelId,
	apiKey = process.env.YOUTUBE_API_KEY,
	fetchImpl = fetch,
) {
	if (!apiKey) return { videos: [], channelMetadata: null };
	const params = new URLSearchParams({
		part: "snippet",
		type: "video",
		order: "date",
		maxResults: "15",
		channelId,
		key: apiKey,
	});
	const response = await fetchImpl(
		`https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
	);
	if (!response.ok) {
		throw Object.assign(
			new Error(`YouTube API returned HTTP ${response.status}`),
			{
				status: response.status,
			},
		);
	}
	const payload = await response.json();
	const items = Array.isArray(payload?.items) ? payload.items : [];
	const videos = items
		.filter((item) => item?.id?.videoId)
		.map((item) => ({
			id: item.id.videoId,
			title: item.snippet?.title || "Untitled",
			channelId,
			channelTitle: item.snippet?.channelTitle || "Unknown",
			publishedAt: item.snippet?.publishedAt || null,
			thumbnail: getHighResolutionVideoThumbnail(
				item.snippet?.thumbnails?.high?.url,
				item.id.videoId,
			),
			description: item.snippet?.description || "",
			duration: null,
			fetchedVia: "youtube-api",
		}));
	return {
		videos,
		channelMetadata: videos[0]
			? { title: videos[0].channelTitle, thumbnail: null }
			: null,
	};
}

async function fetchChannelFeed(channelId, feedParser = parser, options = {}) {
	const fetchImpl = options.fetchImpl || fetch;
	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		options.timeoutMs || 10000,
	);
	try {
		const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
		const headers = { "user-agent": "Feedy/1.0" };
		if (options.etag) headers["if-none-match"] = options.etag;
		if (options.lastModified) {
			headers["if-modified-since"] = options.lastModified;
		}
		const response = await fetchImpl(feedUrl, {
			headers,
			signal: controller.signal,
		});
		const etag = response.headers.get("etag") || options.etag || null;
		const lastModified =
			response.headers.get("last-modified") || options.lastModified || null;
		if (response.status === 304) {
			return {
				outcome: "not-modified",
				source: "rss",
				videos: [],
				itemHash: options.previousItemHash || null,
				etag,
				lastModified,
				channelMetadata: null,
			};
		}
		if (!response.ok) {
			throw Object.assign(new Error(`Feed returned ${response.status}`), {
				status: response.status,
			});
		}
		const feed = await feedParser.parseString(await response.text());
		const videos = [];
		const seen = new Set();
		for (const item of feed.items || []) {
			const video = buildVideoFromFeedItem(item, {
				channelId,
				channelTitle: feed.title || item.author || "Unknown",
			});
			if (!video.id || seen.has(video.id)) continue;
			seen.add(video.id);
			videos.push(video);
		}
		const itemHash = createVideoItemHash(videos);
		if (options.previousItemHash && options.previousItemHash === itemHash) {
			return {
				outcome: "not-modified",
				source: "rss",
				videos: [],
				itemHash,
				etag,
				lastModified,
				channelMetadata: null,
			};
		}
		return {
			outcome: "success",
			source: "rss",
			videos,
			itemHash,
			etag,
			lastModified,
			channelMetadata: {
				title: feed.title || "Unknown Channel",
				thumbnail: null,
			},
		};
	} catch (error) {
		if (typeof options.youtubeApiFallback === "function") {
			try {
				const fallback = await options.youtubeApiFallback(channelId);
				if (fallback?.videos?.length) {
					return {
						...fallback,
						outcome: "success",
						source: "youtube-api",
						itemHash: createVideoItemHash(fallback.videos),
					};
				}
			} catch (fallbackError) {
				console.warn(
					`YouTube API fallback failed for ${channelId}:`,
					fallbackError.message,
				);
			}
		}
		const errorStatus = getHttpStatusFromError(error);
		return {
			outcome: classifyFeedFailure(error),
			source: "rss",
			videos: [],
			itemHash: options.previousItemHash || null,
			channelMetadata: null,
			errorStatus,
			errorMessage: error.message || "Failed to fetch feed",
			transient: classifyFeedFailure(error) === "transient-failure",
		};
	} finally {
		clearTimeout(timeoutId);
	}
}

async function fetchChannelThumbnail(channelId) {
	try {
		const url = `https://www.youtube.com/channel/${channelId}`;
		const response = await axios.get(url, {
			headers: { "User-Agent": "Mozilla/5.0" },
		});

		const html = response.data;

		// og:image is a standard Open Graph tag and is relatively stable.
		const avatarMatch = html.match(
			/<meta property="og:image" content="([^"]+)"/,
		);
		if (avatarMatch) {
			return avatarMatch[1];
		}

		// Fall back to structured extraction from ytInitialData rather than a
		// raw regex on the embedded JSON, which breaks on nested/escaped values.
		const initialData = parseYtInitialData(html);
		if (initialData) {
			let avatarUrl = null;
			walkYouTubeRenderers(initialData, (node) => {
				if (avatarUrl) return;
				const thumbnails =
					node.avatar?.thumbnails || node.thumbnail?.thumbnails;
				if (Array.isArray(thumbnails) && thumbnails.length > 0) {
					const best = thumbnails[thumbnails.length - 1];
					if (best?.url) {
						avatarUrl = best.url;
					}
				}
			});
			if (avatarUrl) {
				return avatarUrl.replace(/\\u0026/g, "&");
			}
		}

		return null;
	} catch (error) {
		console.error(`Failed to fetch thumbnail for ${channelId}:`, error.message);
		return null;
	}
}

module.exports = {
	buildVideoFromFeedItem,
	classifyFeedFailure,
	createVideoItemHash,
	extractBalancedJson,
	fetchChannelFeed,
	fetchChannelThumbnail,
	fetchYouTubeApiVideos,
	fetchUploadsPlaylistFeed,
	getBestThumbnailUrl,
	getTextValue,
	parseDuration,
	parseRelativePublishedAt,
	parseUploadsPlaylistVideos,
	parseYtInitialData,
	walkYouTubeRenderers,
};
