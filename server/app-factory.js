const express = require("express");
const cors = require("cors");
const axios = require("axios");
const {
	mergeIncomingSubscriptions,
	removeSensitiveSyncSettings,
} = require("./subscription-merge");
const {
	getSearchCacheStats,
	getSearchBackendStatus,
	searchChannels,
} = require("./channel-search");
const { normalizeVideoCacheThumbnails } = require("./video-thumbnails");
const { extractYouTubeChannelMetadata } = require("./youtube-html-parser");
const {
	createApiKeyAuthMiddleware,
	createBucketRateLimiter,
	createCorsOptions,
	createOriginGuardMiddleware,
	createRateLimitMiddleware,
	describeAllowlist,
	parseAllowedOrigins,
	validateSyncPayload,
} = require("./security-middleware");
const serverPackage = require("./package.json");

function readPackageMetadata(packagePath, fallback) {
	try {
		return require(packagePath);
	} catch (error) {
		if (error && error.code === "MODULE_NOT_FOUND") {
			return fallback;
		}
		throw error;
	}
}

const APP_PACKAGE = readPackageMetadata("../package.json", {
	version: "unknown",
});

const THUMBNAIL_PROXY_TIMEOUT_MS = 5000;
const THUMBNAIL_PROXY_MAX_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_PROXY_RATE_WINDOW_MS = 60 * 1000;
const THUMBNAIL_PROXY_RATE_MAX = 60;
const ACTIVE_CHANNELS_DEFAULT_LIMIT = 5;
const ACTIVE_CHANNELS_MAX_LIMIT = 50;
const CHANNEL_SEARCH_RATE_WINDOW_MS = 60 * 1000;
const CHANNEL_SEARCH_RATE_MAX = 20;

function asyncHandler(handler, errorMessage) {
	return async (req, res, next) => {
		try {
			await handler(req, res, next);
		} catch (err) {
			console.error(`${errorMessage}:`, err.message || err);
			res.status(500).json({ error: errorMessage });
		}
	};
}

// ── Route handler factories ─────────────────────────────────

function createHealthHandler({
	appStore,
	defaultData,
	defaultVideoCache,
	thumbnailRateLimiter,
}) {
	return asyncHandler(async (req, res) => {
		const [data, videoCache] = await Promise.all([
			appStore.readData(defaultData),
			appStore.readVideoCache(defaultVideoCache),
		]);
		res.json({
			status: "ok",
			subscriptions: data.subscriptions?.length || 0,
			watchedVideos: data.watchedVideos?.length || 0,
			videos: videoCache.totalVideos || videoCache.videos?.length || 0,
			lastUpdated: videoCache.lastUpdated || null,
			uptime: process.uptime(),
			rateLimitBuckets: thumbnailRateLimiter.getBucketStats(),
			searchCache: getSearchCacheStats(),
		});
	}, "Failed health check");
}

function createThumbnailProxyHandler({ thumbnailRateLimiter }) {
	return asyncHandler(async (req, res) => {
		const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
		if (!thumbnailRateLimiter.checkLimit(clientIp)) {
			return res.status(429).json({ error: "Too many thumbnail requests" });
		}
		const rawUrl = req.query.url;
		if (!rawUrl || typeof rawUrl !== "string") {
			return res.status(400).json({ error: "Missing thumbnail URL" });
		}
		let thumbnailUrl;
		try {
			thumbnailUrl = new URL(rawUrl);
		} catch {
			return res.status(400).json({ error: "Invalid thumbnail URL" });
		}
		const allowedHosts = new Set([
			"yt3.googleusercontent.com",
			"yt3.ggpht.com",
			"i.ytimg.com",
		]);
		if (
			thumbnailUrl.protocol !== "https:" ||
			!allowedHosts.has(thumbnailUrl.hostname)
		) {
			return res.status(400).json({ error: "Unsupported thumbnail host" });
		}
		const controller = new AbortController();
		const timeoutId = setTimeout(
			() => controller.abort(),
			THUMBNAIL_PROXY_TIMEOUT_MS,
		);
		let response;
		try {
			response = await fetch(thumbnailUrl.toString(), {
				signal: controller.signal,
				headers: {
					"User-Agent": "Mozilla/5.0",
					Accept:
						"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
				},
			});
		} finally {
			clearTimeout(timeoutId);
		}
		if (!response.ok) {
			return res
				.status(response.status)
				.json({ error: "Failed to fetch thumbnail" });
		}
		const contentType = response.headers.get("content-type") || "";
		if (!contentType.startsWith("image/")) {
			return res
				.status(502)
				.json({ error: "Thumbnail response was not an image" });
		}
		const contentLength = response.headers.get("content-length");
		if (contentLength && Number(contentLength) > THUMBNAIL_PROXY_MAX_BYTES) {
			return res.status(502).json({ error: "Thumbnail exceeds size limit" });
		}
		const imageBuffer = Buffer.from(await response.arrayBuffer());
		if (imageBuffer.length > THUMBNAIL_PROXY_MAX_BYTES) {
			return res.status(502).json({ error: "Thumbnail exceeds size limit" });
		}
		res.setHeader("Content-Type", contentType);
		res.setHeader("Cache-Control", "public, max-age=604800, immutable");
		res.send(imageBuffer);
	}, "Failed to proxy thumbnail");
}

function createApp({
	appStore,
	feedAggregator,
	config = {},
	logStartup = false,
} = {}) {
	if (!appStore) throw new Error("createApp requires appStore");
	if (!feedAggregator) throw new Error("createApp requires feedAggregator");

	const app = express();
	const allowedOrigins = parseAllowedOrigins(
		config.allowedOrigins ?? process.env.ALLOWED_ORIGINS,
	);
	const apiKey = config.apiKey ?? process.env.SERVER_API_TOKEN ?? "";
	const allowInsecure =
		config.allowInsecureUnauthenticatedApi ??
		process.env.ALLOW_INSECURE_UNAUTHENTICATED_API === "true";
	const rateLimitWindow =
		config.rateLimitWindowMs ??
		(Number(process.env.API_WRITE_RATE_LIMIT_WINDOW_MS) || 60 * 1000);
	const rateLimitMax =
		config.rateLimitMax ?? (Number(process.env.API_WRITE_RATE_LIMIT_MAX) || 30);
	const defaultData = config.defaultData ??
		appStore.DEFAULT_DATA ?? {
			subscriptions: [],
			settings: {},
			watchedVideos: [],
			redirects: {},
		};
	const defaultVideoCache = config.defaultVideoCache ??
		appStore.DEFAULT_VIDEO_CACHE ?? {
			videos: [],
			lastUpdated: null,
			totalChannels: 0,
			totalVideos: 0,
			channelRefreshes: {},
		};

	if (logStartup) {
		console.log(
			`[startup] Allowed browser origins: ${describeAllowlist(new Set(allowedOrigins))}`,
		);
	}

	const thumbnailRateLimiter = createBucketRateLimiter({
		windowMs: THUMBNAIL_PROXY_RATE_WINDOW_MS,
		max: THUMBNAIL_PROXY_RATE_MAX,
	});

	// Channel search fans out to multiple external services per request, so it
	// needs its own GET rate limit (the general limiter only covers writes).
	const channelSearchRateLimiter = createRateLimitMiddleware({
		windowMs: CHANNEL_SEARCH_RATE_WINDOW_MS,
		max: CHANNEL_SEARCH_RATE_MAX,
		methods: ["GET"],
	});

	app.use(cors(createCorsOptions({ allowedOrigins })));
	app.use(createOriginGuardMiddleware({ allowedOrigins }));
	app.use(
		"/api",
		createApiKeyAuthMiddleware({
			token: apiKey,
			allowInsecureUnauthenticatedApi: allowInsecure,
		}),
	);
	app.use(
		"/api",
		createRateLimitMiddleware({
			windowMs: rateLimitWindow,
			max: rateLimitMax,
		}),
	);
	app.use(express.json({ limit: "5mb" }));

	app.get("/api/healthz", (req, res) => {
		res.json({ status: "ok" });
	});

	app.get(
		"/api/health",
		createHealthHandler({
			appStore,
			defaultData,
			defaultVideoCache,
			thumbnailRateLimiter,
		}),
	);

	app.get("/api/version", (req, res) => {
		res.json({
			name: serverPackage.name,
			version: serverPackage.version,
			appVersion: APP_PACKAGE.version,
			node: process.version,
			buildDate: process.env.BUILD_DATE || null,
		});
	});

	app.get(
		"/api/sync",
		asyncHandler(async (req, res) => {
			const data = await appStore.readData(defaultData);
			const revision = data.syncRevision ?? appStore.getCurrentRevision();
			res.setHeader("ETag", `"${revision}"`);
			res.json(removeSensitiveSyncSettings(data));
		}, "Failed to read data"),
	);

	app.get(
		"/api/channel-thumbnail",
		createThumbnailProxyHandler({ thumbnailRateLimiter }),
	);

	app.get(
		"/api/channel-search",
		channelSearchRateLimiter,
		asyncHandler(async (req, res) => {
			const query = String(req.query.q || "").trim();
			if (query.length < 2) {
				return res.json({ results: [] });
			}
			const braveKey = String(req.header("x-brave-api-key") || "").trim() || undefined;
			const results = await searchChannels(query, { limit: 8, braveKey });
			res.json({ results });
		}, "Failed to search channels"),
	);

	app.post(
		"/api/sync",
		asyncHandler(async (req, res) => {
			const data = removeSensitiveSyncSettings(req.body);
			const validation = validateSyncPayload(data);
			if (!validation.valid) {
				return res.status(400).json({ error: validation.error });
			}
			const ifMatchHeader = req.header("if-match");
			if (ifMatchHeader !== undefined && ifMatchHeader !== "") {
				const parsed = Number.parseInt(
					String(ifMatchHeader).replace(/^"|"$/g, ""),
					10,
				);
				if (!Number.isFinite(parsed) || parsed < 0) {
					return res.status(400).json({ error: "Invalid If-Match revision" });
				}
				const currentRevision = appStore.getCurrentRevision();
				if (parsed !== currentRevision) {
					res.setHeader("ETag", `"${currentRevision}"`);
					return res.status(412).json({
						error: "Sync revision mismatch",
						currentRevision,
					});
				}
			}
			data.lastSyncedAt = new Date().toISOString();
			const savedData = await appStore.updateData(
				defaultData,
				(existingData) => {
					const redirects = existingData.redirects || {};
					if (data.subscriptions) {
						data.subscriptions = mergeIncomingSubscriptions(
							data.subscriptions,
							existingData.subscriptions || [],
							redirects,
							existingData.subscriptionTombstones || [],
						);
					}
					data.redirects = { ...redirects, ...(data.redirects || {}) };
					return data;
				},
				{ trackSubscriptionChanges: true },
			);
			feedAggregator
				.aggregateFeeds()
				.catch((err) => console.error("Aggregation trigger failed:", err));
			const newRevision =
				savedData.syncRevision ?? appStore.getCurrentRevision();
			res.setHeader("ETag", `"${newRevision}"`);
			res.json({
				success: true,
				timestamp: savedData.lastSyncedAt,
				syncRevision: newRevision,
			});
		}, "Failed to save data"),
	);

	app.delete(
		"/api/subscriptions/:id",
		asyncHandler(async (req, res) => {
			const { id } = req.params;
			const current = await appStore.readData(defaultData);
			const found = current.subscriptions.some(
				(subscription) => subscription.id === id,
			);
			if (!found) {
				return res.status(404).json({ error: "Subscription not found" });
			}

			const savedData = await appStore.updateData(
				defaultData,
				(data) => ({
					...data,
					subscriptions: (data.subscriptions || []).filter(
						(subscription) => subscription.id !== id,
					),
				}),
				{ trackSubscriptionChanges: true },
			);
			feedAggregator
				.aggregateFeeds()
				.catch((err) => console.error("Aggregation trigger failed:", err));
			const newRevision =
				savedData.syncRevision ?? appStore.getCurrentRevision();
			res.setHeader("ETag", `"${newRevision}"`);
			res.json({
				success: true,
				deletedId: id,
				syncRevision: newRevision,
			});
		}, "Failed to delete subscription"),
	);

	app.get(
		"/api/videos",
		asyncHandler(async (req, res) => {
			let data;
			try {
				data = await appStore.readVideoCache(defaultVideoCache);
			} catch (err) {
				if (err.code === "ENOENT") {
					return res.json({
						videos: [],
						lastUpdated: null,
						totalChannels: 0,
						totalVideos: 0,
					});
				}
				throw err;
			}
			const normalized = normalizeVideoCacheThumbnails(data);
			const etag = `"${normalized.lastUpdated || "empty"}"`;
			if (req.header("if-none-match") === etag) {
				return res.status(304).end();
			}
			res.setHeader("ETag", etag);
			res.json(normalized);
		}, "Failed to read videos"),
	);

	app.get(
		"/api/videos/status",
		asyncHandler(async (req, res) => {
			const requestedLimit = Number.parseInt(req.query.limit, 10);
			const limit =
				Number.isFinite(requestedLimit) && requestedLimit > 0
					? Math.min(requestedLimit, ACTIVE_CHANNELS_MAX_LIMIT)
					: ACTIVE_CHANNELS_DEFAULT_LIMIT;
			const [status, activeChannels] = await Promise.all([
				Promise.resolve(feedAggregator.getAggregationStatus()),
				feedAggregator.getActiveChannels({ limit }),
			]);
			res.json({
				...status,
				activeChannels,
				searchBackends: getSearchBackendStatus(),
			});
		}, "Failed to read aggregation status"),
	);

	app.post(
		"/api/videos/refresh",
		asyncHandler(async (req, res) => {
			feedAggregator
				.aggregateFeeds({ force: true })
				.catch((err) => console.error("Background aggregation error:", err));
			res.json({
				success: true,
				message: "Refresh started in background. Check back in a few minutes.",
			});
		}, "Failed to trigger refresh"),
	);

	app.post(
		"/api/videos/cache/reset",
		asyncHandler(async (req, res) => {
			await appStore.writeVideoCache({
				videos: [],
				lastUpdated: null,
				totalChannels: 0,
				totalVideos: 0,
				channelRefreshes: {},
			});
			res.json({ success: true });
		}, "Failed to reset video cache"),
	);

	app.post(
		"/api/resolve-channel",
		asyncHandler(async (req, res) => {
			const { type, value } = req.body;
			if (!type || !value) {
				return res.status(400).json({ error: "Missing type or value" });
			}
			if (
				typeof value !== "string" ||
				value.length > 256 ||
				!/^[\w.@\-/]+$/.test(value)
			) {
				return res.status(400).json({ error: "Invalid value" });
			}
			let url;
			if (type === "handle") {
				const handle = value.startsWith("@") ? value : `@${value}`;
				url = `https://www.youtube.com/${handle}`;
			} else if (type === "custom_url") {
				url = `https://www.youtube.com/${value}`;
			} else {
				return res.status(400).json({ error: "Invalid type" });
			}
			const response = await axios.get(url, {
				headers: { "User-Agent": "Mozilla/5.0" },
				timeout: 10000,
			});
			const { channelId, title, disabled } = extractYouTubeChannelMetadata(
				response.data,
			);
			if (disabled) {
				return res
					.status(503)
					.json({ error: "YouTube HTML parsing is disabled" });
			}
			if (!channelId) {
				return res.status(404).json({ error: "Could not resolve channel ID" });
			}
			res.json({ channelId, title: title || value, thumbnail: null });
		}, "Failed to resolve channel"),
	);

	app.post(
		"/api/subscriptions/:id/mute",
		asyncHandler(async (req, res) => {
			const { id } = req.params;
			const { isMuted } = req.body;
			if (typeof isMuted !== "boolean") {
				return res.status(400).json({ error: "isMuted must be a boolean" });
			}
			const data = await appStore.readData(defaultData);
			const found = data.subscriptions.some((s) => s.id === id);
			if (!found) {
				return res.status(404).json({ error: "Subscription not found" });
			}
			await appStore.updateSubscriptionField(id, "isMuted", isMuted);
			res.json({ success: true, isMuted });
		}, "Failed to update channel"),
	);

	return { app, thumbnailRateLimiter };
}

module.exports = {
	ACTIVE_CHANNELS_DEFAULT_LIMIT,
	ACTIVE_CHANNELS_MAX_LIMIT,
	CHANNEL_SEARCH_RATE_MAX,
	CHANNEL_SEARCH_RATE_WINDOW_MS,
	THUMBNAIL_PROXY_MAX_BYTES,
	THUMBNAIL_PROXY_RATE_MAX,
	THUMBNAIL_PROXY_RATE_WINDOW_MS,
	THUMBNAIL_PROXY_TIMEOUT_MS,
	createApp,
};
