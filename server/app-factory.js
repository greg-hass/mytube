const express = require("express");
const cors = require("cors");
const compression = require("compression");
const logger = require("./logger");
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
const { getChannelSuggestions } = require("./channel-suggestions");
const { searchVideos } = require("./video-search");
const { createChannelBackfillService } = require("./channel-backfill");
const { normalizeVideoCacheThumbnails } = require("./video-thumbnails");
const { pruneVideosToActiveChannels } = require("./video-archive");
const { extractYouTubeChannelMetadata } = require("./youtube-html-parser");
const { createLiveStreamService } = require("./live-stream-service");
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
const LIVE_LOOKUP_RATE_WINDOW_MS = 60 * 1000;
const LIVE_LOOKUP_RATE_MAX = 15;

function asyncHandler(handler, errorMessage) {
	return async (req, res, next) => {
		try {
			await handler(req, res, next);
		} catch (err) {
			logger.error(`${errorMessage}:`, err.message || err);
			res.status(500).json({ error: errorMessage });
		}
	};
}

// Refresh at most this many newly-added subscriptions individually; larger
// batches (imports, initial sync) are cheaper as one full sweep.
const TARGETED_REFRESH_MAX_CHANNELS = 3;

function getAddedSubscriptionIds(previousSubscriptions, nextSubscriptions) {
	const previousIds = new Set(
		(previousSubscriptions || []).map((subscription) => subscription?.id),
	);
	return (nextSubscriptions || [])
		.map((subscription) => subscription?.id)
		.filter((id) => id && !previousIds.has(id));
}

/**
 * Refresh only what a subscription change actually needs. Small batches of
 * canonical UC ids get single-channel runs so the rest of the archive keeps
 * its refresh cadence; temp ids (handle_/custom_) and bulk adds fall back to
 * a full run because they need the resolver machinery or sheer volume.
 */
function triggerRefreshForAddedChannels(
	feedAggregator,
	addedIds,
	channelBackfill,
) {
	if (addedIds.length === 0) return;

	const canonicalIds = addedIds.filter((id) => id.startsWith("UC"));
	const needsFullRun =
		canonicalIds.length !== addedIds.length ||
		canonicalIds.length > TARGETED_REFRESH_MAX_CHANNELS;

	if (needsFullRun) {
		feedAggregator
			.aggregateFeeds()
			.catch((err) => logger.error("Aggregation trigger failed:", err));
		return;
	}

	(async () => {
		for (const channelId of canonicalIds) {
			try {
				await feedAggregator.aggregateFeeds({ channelId });
				// A newly-added subscription only has ~15 RSS videos on day one —
				// backfill its uploads playlist so the archive starts deep.
				if (channelBackfill) {
					channelBackfill
						.backfillChannel(channelId)
						.catch((err) =>
							logger.error(
								`On-add backfill failed for ${channelId}:`,
								err.message || err,
							),
						);
				}
			} catch (err) {
				logger.error(
					`Targeted refresh failed for ${channelId}:`,
					err.message || err,
				);
			}
		}
	})();
}

// ── Route handler factories ─────────────────────────────────

function createHealthHandler({
	appStore,
	defaultData,
	defaultVideoCache,
	thumbnailRateLimiter,
}) {
	return asyncHandler(async (_req, res) => {
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
					Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
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
		res.end(imageBuffer);
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

	const channelBackfill =
		config.channelBackfillService || createChannelBackfillService({ appStore });

	const app = express(); // nosemgrep: express-check-csurf-middleware-usage (bearer-token auth, not cookies)

	app.use(compression());

	// Trust the single nginx reverse proxy hop so req.ip reflects the real
	// client via X-Forwarded-For. This makes per-client rate limiting work.
	app.set("trust proxy", 1);

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
		logger.info(
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
	const liveLookupRateLimiter = createRateLimitMiddleware({
		windowMs: LIVE_LOOKUP_RATE_WINDOW_MS,
		max: LIVE_LOOKUP_RATE_MAX,
		methods: ["GET"],
	});
	const liveStreamService =
		config.liveStreamService || createLiveStreamService(config.liveStreamOptions);

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

	app.get("/api/healthz", (_req, res) => {
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

	app.get("/api/version", (_req, res) => {
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
		asyncHandler(async (_req, res) => {
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
			const results = await searchChannels(query, {
				limit: 8,
				youtubeApiKey:
					String(req.header("x-youtube-api-key") || "").trim() ||
					process.env.YOUTUBE_API_KEY,
			});
			res.json({ results });
		}, "Failed to search channels"),
	);

	app.post(
		"/api/channel-suggestions",
		channelSearchRateLimiter,
		asyncHandler(async (req, res) => {
			const { subscriptions } = req.body || {};
			const list = Array.isArray(subscriptions) ? subscriptions : [];
			if (list.length === 0) {
				return res.status(400).json({ error: "No subscriptions provided" });
			}
			const youtubeApiKey =
				String(req.header("x-youtube-api-key") || "").trim() ||
				process.env.YOUTUBE_API_KEY;
			const results = await getChannelSuggestions(list, { youtubeApiKey });
			res.json({ results });
		}, "Failed to generate suggestions"),
	);

	app.post(
		"/api/video-search",
		channelSearchRateLimiter,
		asyncHandler(async (req, res) => {
			const query = String((req.body || {}).query || "").trim();
			if (query.length < 2) {
				return res
					.status(400)
					.json({ error: "Query must be at least 2 characters" });
			}
			const { results, source } = await searchVideos(query);
			res.json({ results, source });
		}, "Failed to search videos"),
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
			const previousSubscriptions = (await appStore.readData(defaultData))
				.subscriptions;
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
			// Refresh only the channels this sync actually added — a plain watched-
			// video push must not restart the sweep clock for every subscription.
			triggerRefreshForAddedChannels(
				feedAggregator,
				getAddedSubscriptionIds(previousSubscriptions, savedData.subscriptions),
				channelBackfill,
			);
			const newRevision = savedData.syncRevision ?? appStore.getCurrentRevision();
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
			// A deletion needs no feed fetching: prune the channel's videos from
			// the archive locally so they vanish immediately; the next scheduled
			// run would have evicted them anyway.
			const videoCache = await appStore.readVideoCache(defaultVideoCache);
			const activeChannelIds = new Set(
				(savedData.subscriptions || []).map((subscription) => subscription.id),
			);
			const prunedVideos = pruneVideosToActiveChannels(
				videoCache.videos || [],
				activeChannelIds,
			);
			if (prunedVideos.length !== (videoCache.videos || []).length) {
				await appStore.writeVideoCache({
					...videoCache,
					videos: prunedVideos,
					totalVideos: prunedVideos.length,
					lastUpdated: new Date().toISOString(),
				});
			}
			const newRevision = savedData.syncRevision ?? appStore.getCurrentRevision();
			res.setHeader("ETag", `"${newRevision}"`);
			res.json({
				success: true,
				deletedId: id,
				syncRevision: newRevision,
			});
		}, "Failed to delete subscription"),
	);

	app.post(
		"/api/subscriptions/restore",
		asyncHandler(async (req, res) => {
			const subscriptions = req.body?.subscriptions;
			const validation = validateSyncPayload({
				subscriptions,
				settings: {},
				watchedVideos: [],
			});
			if (!validation.valid) {
				return res.status(400).json({ error: validation.error });
			}

			const restoredById = new Map(
				subscriptions.map((subscription) => [subscription.id, subscription]),
			);
			const savedData = await appStore.updateData(
				defaultData,
				(data) => ({
					...data,
					subscriptions: [
						...(data.subscriptions || []).filter(
							(subscription) => !restoredById.has(subscription.id),
						),
						...restoredById.values(),
					],
				}),
				{ trackSubscriptionChanges: false },
			);
			// Undoing a deletion re-adds channels; refresh exactly those.
			triggerRefreshForAddedChannels(
				feedAggregator,
				Array.from(restoredById.keys()),
				channelBackfill,
			);
			const newRevision = savedData.syncRevision ?? appStore.getCurrentRevision();
			res.setHeader("ETag", `"${newRevision}"`);
			res.json({
				success: true,
				restoredIds: Array.from(restoredById.keys()),
				syncRevision: newRevision,
			});
		}, "Failed to restore subscriptions"),
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
			const total = Number(status.total) || 0;
			const completed = Math.min(Number(status.current) || 0, total);
			const active =
				status.state === "running" ? Math.max(total - completed, 0) : 0;
			const failed = Number(status.errors) || 0;
			res.json({
				...status,
				total,
				completed,
				active,
				queued: active,
				running: active,
				succeeded: Math.max(completed - failed, 0),
				failed,
				activeChannels,
				searchBackends: getSearchBackendStatus(),
			});
		}, "Failed to read aggregation status"),
	);

	app.get(
		"/api/videos/live",
		liveLookupRateLimiter,
		asyncHandler(async (req, res) => {
			const data = await appStore.readData(defaultData);
			const subscriptions = Array.isArray(data.subscriptions)
				? data.subscriptions.filter((subscription) => !subscription.isMuted)
				: [];
			const result = await liveStreamService.scanSubscriptions(subscriptions, {
				force: req.query.refresh === "1",
			});
			res.setHeader("Cache-Control", "private, no-store");
			res.json(result);
		}, "Failed to check live subscriptions"),
	);

	app.post(
		"/api/videos/refresh",
		asyncHandler(async (_req, res) => {
			const status = feedAggregator.getAggregationStatus?.() || {};
			const alreadyRunning = status.state === "running";

			feedAggregator
				.aggregateFeeds()
				.catch((err) => logger.error("Background aggregation error:", err));

			const currentData = await appStore.readData(
				appStore.DEFAULT_DATA || { subscriptions: [] },
			);
			const subscriptionCount = Array.isArray(currentData?.subscriptions)
				? currentData.subscriptions.length
				: 0;
			const total = status.total || subscriptionCount;
			res.json({
				success: true,
				current: status.current || 0,
				total,
				queued: Math.max(total - (status.current || 0), 0),
				message: alreadyRunning
					? "Refresh already in progress. Joining the active refresh."
					: "Refresh queued. Check status for progress.",
			});
		}, "Failed to trigger refresh"),
	);

	app.post(
		"/api/videos/backfill/channel/:channelId",
		asyncHandler(async (req, res) => {
			const { channelId } = req.params;
			if (typeof channelId !== "string" || !/^UC[\w-]{2,}$/.test(channelId)) {
				return res.status(400).json({ error: "Invalid channel ID" });
			}

			const data = await appStore.readData(
				appStore.DEFAULT_DATA || { subscriptions: [] },
			);
			if (
				!data.subscriptions?.some((subscription) => subscription.id === channelId)
			) {
				return res.status(404).json({ error: "Subscription not found" });
			}

			const result = await channelBackfill.backfillChannel(channelId);
			if (result?.error === "already_running") {
				return res.status(429).json({ error: "Backfill already in progress" });
			}
			if (result?.error === "fetch_failed") {
				return res.status(502).json({ error: "Failed to load channel videos" });
			}
			res.json({
				success: true,
				channelId,
				added: result?.added ?? 0,
				channelTotal: result?.channelTotal ?? 0,
			});
		}, "Failed to backfill channel videos"),
	);

	app.post(
		"/api/videos/refresh/channel/:channelId",
		asyncHandler(async (req, res) => {
			const { channelId } = req.params;
			if (typeof channelId !== "string" || !/^UC[\w-]{2,}$/.test(channelId)) {
				return res.status(400).json({ error: "Invalid channel ID" });
			}

			const data = await appStore.readData(
				appStore.DEFAULT_DATA || { subscriptions: [] },
			);
			if (
				!data.subscriptions?.some((subscription) => subscription.id === channelId)
			) {
				return res.status(404).json({ error: "Subscription not found" });
			}

			const status = feedAggregator.getAggregationStatus?.() || {};
			if (status.state === "running") {
				return res.json({
					success: true,
					channelId,
					alreadyRunning: true,
					message: "A feed refresh is already in progress.",
				});
			}

			feedAggregator
				.aggregateFeeds({ channelId })
				.catch((err) =>
					logger.error(`Background refresh failed for ${channelId}:`, err),
				);

			res.json({
				success: true,
				channelId,
				message: "Channel refresh queued.",
			});
		}, "Failed to trigger channel refresh"),
	);

	app.post(
		"/api/videos/cache/reset",
		asyncHandler(async (_req, res) => {
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
				return res.status(503).json({ error: "YouTube HTML parsing is disabled" });
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
