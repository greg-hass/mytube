const logger = require("./logger");
const appStore = require("./app-store");
const { mergeVideoArchive } = require("./video-archive");
const {
	buildVideoFromFeedItem,
	createVideoItemHash,
	fetchChannelFeed,
	fetchChannelThumbnail,
	fetchYouTubeApiVideos,
} = require("./feed-fetcher");
const {
	isInnerTubeAvailable,
	fetchSubscriptionFeed,
} = require("./innertube-fetcher");
const {
	CHANNEL_REFRESH_INTERVAL_MS,
	DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
	getChannelsDueForRefresh,
	getNextChannelsForRefresh,
	getScheduledRefreshConfig,
	mergeChannelRefreshes,
	summarizeFailedChannels,
} = require("./feed-refresh-policy");
const {
	ARCHIVED_SHORTS_BACKFILL_RETRY_INTERVAL_MS,
	applyLocalShortsMetadata,
	backfillArchivedShortsStatus,
	enrichVideosWithShortsStatus,
	isArchivedShortsBackfillDue,
	looksLikeShortByLocalMetadata,
	resolveYouTubeShortsStatus,
	startArchivedShortsStatusBackfill,
} = require("./shorts-status");
const {
	applySubscriptionRedirects,
	resolveTemporarySubscriptions,
} = require("./subscription-resolver");

const BATCH_SIZE = 20;
const BATCH_DELAY = 200; // 200ms between batches
const MAX_ARCHIVED_VIDEOS = Number(process.env.MAX_ARCHIVED_VIDEOS) || 5000;
const API_RESOLVER_DAILY_QUOTA_CAP = 100;
const STARTUP_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_DATA = {
	subscriptions: [],
	settings: {},
	watchedVideos: [],
	redirects: {},
};
const QUOTA_TIMEZONE = "America/Los_Angeles";

function countRefreshOutcomes(results = []) {
	const counts = {
		success: 0,
		notModified: 0,
		transientFailure: 0,
		permanentFailure: 0,
	};
	for (const result of results) {
		if (result.outcome === "not-modified") counts.notModified += 1;
		else if (result.outcome === "transient-failure")
			counts.transientFailure += 1;
		else if (result.outcome === "permanent-failure")
			counts.permanentFailure += 1;
		else counts.success += 1;
	}
	return counts;
}

function getCurrentDateInTimezone(timeZone = QUOTA_TIMEZONE, now = new Date()) {
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "numeric",
		day: "numeric",
	}).format(now);
}

function createFeedAggregator(storeOverride) {
	const store = storeOverride || appStore;
	let aggregationPromise = null;
	let archivedShortsBackfillPromise = null;
	let archivedShortsBackfillLastAttemptAt = null;
	let scheduledRefreshTimer = null;
	let scheduledRefreshStatus = {
		enabled: false,
		intervalMs: DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
		nextRunAt: null,
		lastRunAt: null,
	};
	let aggregationStatus = {
		state: "idle",
		current: 0,
		total: 0,
		videos: 0,
		errors: 0,
		failedChannels: [],
		startedAt: null,
		completedAt: null,
		lastUpdated: null,
	};

	function scheduleArchivedShortsStatusBackfill(
		archivedVideos,
		shortsStatusById,
	) {
		if (archivedShortsBackfillPromise) return;

		const hasUncheckedVideos = archivedVideos.some(
			(video) => video?.id && typeof shortsStatusById[video.id] !== "boolean",
		);
		if (!hasUncheckedVideos) return;
		if (!isArchivedShortsBackfillDue(archivedShortsBackfillLastAttemptAt))
			return;

		archivedShortsBackfillLastAttemptAt = Date.now();
		archivedShortsBackfillPromise = startArchivedShortsStatusBackfill(
			archivedVideos,
			{ ...shortsStatusById },
			{
				onComplete: async (completedStatuses) => {
					const latestVideoCache = await store.readVideoCache({
						videos: [],
					});
					const mergedStatuses = {
						...(latestVideoCache.shortsStatusById || {}),
						...completedStatuses,
					};
					const latestVideos = latestVideoCache.videos || [];
					applyLocalShortsMetadata(latestVideos, mergedStatuses);

					await store.writeVideoCache({
						...latestVideoCache,
						videos: latestVideos,
						shortsStatusById: mergedStatuses,
					});
					aggregationStatus = {
						...aggregationStatus,
						lastUpdated: new Date().toISOString(),
					};
					logger.info("✅ Archived Shorts metadata backfill saved");
				},
			},
		).finally(() => {
			archivedShortsBackfillPromise = null;
		});
	}

	function getCurrentPacificDate() {
		return getCurrentDateInTimezone(QUOTA_TIMEZONE);
	}

	async function refreshBatch(
		batch,
		subscriptions,
		fetchedChannelResults,
		deps = {},
	) {
		const feedFetcher = deps.fetchChannelFeed || fetchChannelFeed;
		const thumbnailFetcher =
			deps.fetchChannelThumbnail || fetchChannelThumbnail;
		const channelRefreshes = deps.channelRefreshes || {};
		const youtubeApiFallback =
			deps.youtubeApiFallback ||
			(process.env.YOUTUBE_API_KEY
				? (channelId) =>
						fetchYouTubeApiVideos(channelId, process.env.YOUTUBE_API_KEY)
				: undefined);
		const batchRefreshResults = [];
		const batchVideos = [];

		const batchPromises = batch.map(async (sub) => {
			const feedResult = await feedFetcher(sub.id, undefined, {
				previousItemHash: channelRefreshes[sub.id]?.itemHash,
				etag: channelRefreshes[sub.id]?.etag,
				lastModified: channelRefreshes[sub.id]?.lastModified,
				youtubeApiFallback,
			});
			const { videos, channelMetadata } = feedResult;
			const refreshResult = {
				...sub,
				expected: true,
				source: "rss",
				...feedResult,
			};
			batchRefreshResults.push(refreshResult);
			fetchedChannelResults.push(refreshResult);

			if (channelMetadata && channelMetadata.title) {
				const subIndex = subscriptions.findIndex(
					(subscription) => subscription.id === sub.id,
				);
				if (subIndex !== -1) {
					subscriptions[subIndex].title = channelMetadata.title;
				}
			}

			return videos;
		});

		const batchResults = await Promise.all(batchPromises);
		batchResults.forEach((videos) => batchVideos.push(...videos));

		const thumbnailUpdates = [];
		for (const sub of batch) {
			const subIndex = subscriptions.findIndex(
				(subscription) => subscription.id === sub.id,
			);
			if (
				subIndex !== -1 &&
				(!subscriptions[subIndex].thumbnail ||
					subscriptions[subIndex].thumbnail.includes("ui-avatars"))
			) {
				const thumbnail = await thumbnailFetcher(sub.id);
				if (thumbnail) {
					subscriptions[subIndex].thumbnail = thumbnail;
				}
			}
		}
		await Promise.all(thumbnailUpdates);

		return { batchRefreshResults, batchVideos };
	}

	async function runAggregation() {
		logger.info("🔄 Starting feed aggregation...");

		try {
			// Read data to get subscriptions and settings
			const parsedData = await store.readData(DEFAULT_DATA);
			const subscriptions = parsedData.subscriptions || [];
			const existingVideoCache = await store.readVideoCache({ videos: [] });
			let existingVideos = existingVideoCache.videos || [];
			const shortsStatusById = existingVideoCache.shortsStatusById || {};
			applyLocalShortsMetadata(existingVideos, shortsStatusById);
			existingVideos = existingVideos.map((video) =>
				video?.id && typeof shortsStatusById[video.id] === "boolean"
					? { ...video, isShort: shortsStatusById[video.id] }
					: video,
			);
			let channelRefreshes = existingVideoCache.channelRefreshes || {};
			const apiKey = process.env.YOUTUBE_API_KEY;
			if (!parsedData.settings) parsedData.settings = {};

			const currentPacificDate = getCurrentPacificDate();
			if (parsedData.settings.lastQuotaResetDate !== currentPacificDate) {
				parsedData.settings.quotaUsed = 0;
				parsedData.settings.lastQuotaResetDate = currentPacificDate;
			}

			const startingResolverQuota = Number(parsedData.settings?.quotaUsed || 0);
			let resolverQuotaUsed = startingResolverQuota;
			const useResolverApi = Boolean(
				apiKey && resolverQuotaUsed < API_RESOLVER_DAILY_QUOTA_CAP,
			);

			if (apiKey && useResolverApi)
				logger.info(
					"🔑 API key available as capped fallback; discovery and videos remain RSS/HTML-first",
				);
			else if (apiKey)
				logger.info(
					"ℹ️ API resolver quota cap reached or unavailable; using RSS/public fallbacks only",
				);

			const allVideos = [];
			let failedChannels = [];
			const fetchedChannelResults = [];

			const redirectResult = applySubscriptionRedirects(
				subscriptions,
				parsedData.redirects || {},
			);
			if (redirectResult.changed) {
				parsedData.subscriptions = redirectResult.subscriptions;
				await store.writeData(parsedData);
				logger.info("💾 Updated subscriptions with redirects");
				subscriptions.length = 0;
				subscriptions.push(...redirectResult.subscriptions);
			}

			if (useResolverApi) {
				if (!parsedData.redirects) parsedData.redirects = {};
				const resolveResult = await resolveTemporarySubscriptions(
					subscriptions,
					{
						apiKey,
						redirects: parsedData.redirects,
						resolverQuotaUsed,
						quotaCap: API_RESOLVER_DAILY_QUOTA_CAP,
					},
				);
				resolverQuotaUsed = resolveResult.resolverQuotaUsed;
				parsedData.settings.quotaUsed = resolverQuotaUsed;

				if (resolveResult.changed) {
					parsedData.subscriptions = resolveResult.subscriptions;
					await store.writeData(parsedData);
					logger.info("💾 Updated subscriptions with resolved IDs");
					subscriptions.length = 0;
					subscriptions.push(...resolveResult.subscriptions);
				}
			}

			const subscriptionsToRefresh = subscriptions;
			const aggregationStartedAt = new Date().toISOString();
			aggregationStatus = {
				state: "running",
				current: 0,
				total: subscriptions.length,
				videos: existingVideos.length,
				errors: 0,
				failedChannels: [],
				startedAt: aggregationStartedAt,
				completedAt: null,
				lastUpdated: new Date().toISOString(),
			};

			// Try InnerTube subscription feed first (up to 5 pages).
			// Falls back to per-channel RSS polling for any subscription not returned by InnerTube.
			let innerTubeCoveredChannelIds = new Set();
			if (isInnerTubeAvailable()) {
				try {
					const innertubeResult = await fetchSubscriptionFeed({ maxPages: 5 });
					if (innertubeResult?.videos?.length > 0) {
						const channelCount = Object.keys(
							innertubeResult.channelMetadata,
						).length;
						logger.info(
							`⚡ InnerTube: ${innertubeResult.videos.length} videos from ${channelCount} channels`,
						);
						allVideos.push(...innertubeResult.videos);

						// Build channel refresh results for all channels that had videos
						const videosByChannel = new Map();
						for (const video of innertubeResult.videos) {
							if (!videosByChannel.has(video.channelId)) {
								videosByChannel.set(video.channelId, []);
							}
							videosByChannel.get(video.channelId).push(video);
						}

						for (const [channelId, channelVideos] of videosByChannel) {
							const sub = subscriptions.find((s) => s.id === channelId);
							fetchedChannelResults.push({
								...sub,
								id: channelId,
								expected: true,
								outcome: "success",
								source: "innertube",
								videos: channelVideos,
								itemHash: createVideoItemHash(channelVideos),
							});
						}

						// Update channel titles from InnerTube metadata
						for (const video of innertubeResult.videos) {
							const subIndex = subscriptions.findIndex(
								(s) => s.id === video.channelId,
							);
							if (subIndex !== -1 && video.channelTitle) {
								subscriptions[subIndex].title = video.channelTitle;
							}
						}

						await enrichVideosWithShortsStatus(allVideos, shortsStatusById);
						channelRefreshes = mergeChannelRefreshes(
							channelRefreshes,
							new Set(subscriptions.map((sub) => sub.id)),
							fetchedChannelResults,
							new Date().toISOString(),
						);

						innerTubeCoveredChannelIds = new Set(videosByChannel.keys());
					}
				} catch (innertubeError) {
					logger.warn(
						`⚠️ InnerTube fetch failed, falling back to RSS: ${innertubeError.message}`,
					);
				}
			}

			// RSS fallback for any channels not covered by InnerTube.
			const rssSubscriptions = subscriptionsToRefresh.filter(
				(sub) => !innerTubeCoveredChannelIds.has(sub.id),
			);

			if (rssSubscriptions.length > 0) {
				logger.info(
					`🐢 RSS fallback: refreshing ${rssSubscriptions.length} channels not covered by InnerTube`,
				);

				// Process in batches
				const CURRENT_BATCH_SIZE = BATCH_SIZE;

				for (
					let i = 0;
					i < rssSubscriptions.length;
					i += CURRENT_BATCH_SIZE
				) {
					const batch = rssSubscriptions.slice(i, i + CURRENT_BATCH_SIZE);

					const { batchRefreshResults, batchVideos } = await refreshBatch(
						batch,
						subscriptions,
						fetchedChannelResults,
						{ channelRefreshes },
					);

					await enrichVideosWithShortsStatus(batchVideos, shortsStatusById);
					allVideos.push(...batchVideos);

					const { videos: currentVideos } = mergeVideoArchive(
						existingVideos,
						allVideos,
						{
							activeChannelIds: new Set(subscriptions.map((sub) => sub.id)),
							maxVideos: MAX_ARCHIVED_VIDEOS,
							cacheUpdatedAt: existingVideoCache.lastUpdated,
						},
					);
					channelRefreshes = mergeChannelRefreshes(
						channelRefreshes,
						new Set(subscriptions.map((sub) => sub.id)),
						batchRefreshResults.length > 0 ? batchRefreshResults : batch,
						new Date().toISOString(),
					);
					failedChannels = summarizeFailedChannels(
						fetchedChannelResults,
						channelRefreshes,
					);

					aggregationStatus = {
						...aggregationStatus,
						current: Math.min(
							i + CURRENT_BATCH_SIZE,
							rssSubscriptions.length,
						),
						videos: currentVideos.length,
						errors: failedChannels.length,
						failedChannels,
						outcomes: countRefreshOutcomes(fetchedChannelResults),
						lastUpdated: new Date().toISOString(),
					};

					// Match Feedy's progressive refresh behavior: publish each completed
					// batch so status polling can immediately reveal newly fetched videos.
					await store.writeVideoCache({
						videos: currentVideos,
						lastUpdated: new Date().toISOString(),
						totalChannels: subscriptions.length,
						totalVideos: currentVideos.length,
						channelRefreshes,
						shortsStatusById,
					});

					logger.info(
						`RSS fallback progress: ${Math.min(
							i + CURRENT_BATCH_SIZE,
							rssSubscriptions.length,
						)}/${rssSubscriptions.length}`,
					);

					// Delay between batches
					if (i + CURRENT_BATCH_SIZE < rssSubscriptions.length) {
						await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
					}
				}
			} else if (allVideos.length === 0) {
				logger.info(
					"⚠️ No videos returned by InnerTube or RSS; nothing to aggregate.",
				);
			}

			const { videos: archivedVideos, evictedCount: totalEvicted } =
				mergeVideoArchive(existingVideos, allVideos, {
					activeChannelIds: new Set(subscriptions.map((sub) => sub.id)),
					maxVideos: MAX_ARCHIVED_VIDEOS,
					cacheUpdatedAt: existingVideoCache.lastUpdated,
				});
			if (totalEvicted > 0) {
				logger.info(
					`📦 Archive cap (${MAX_ARCHIVED_VIDEOS}): ${totalEvicted} old videos evicted`,
				);
			}
			const archivedVideosWithShortsStatus = archivedVideos.map((video) =>
				video?.id && typeof shortsStatusById[video.id] === "boolean"
					? { ...video, isShort: shortsStatusById[video.id] }
					: video,
			);

			// Merge aggregator results with current DB state to avoid clobbering
			// concurrent mutations (adds, deletes/tombstones, watched state).
			const aggregatorSubs = subscriptions;
			const aggregatorRedirects = parsedData.redirects || {};
			const aggregatorQuotaUsed = parsedData.settings?.quotaUsed;
			const aggregatorQuotaResetDate = parsedData.settings?.lastQuotaResetDate;
			await store.updateData(DEFAULT_DATA, (current) => {
				const aggregatorMeta = new Map(aggregatorSubs.map((s) => [s.id, s]));
				const mergedSubs = (current.subscriptions || []).map(
					(sub) => aggregatorMeta.get(sub.id) || sub,
				);
				return {
					...current,
					subscriptions: mergedSubs,
					redirects: {
						...(current.redirects || {}),
						...aggregatorRedirects,
					},
					settings: {
						...current.settings,
						quotaUsed: aggregatorQuotaUsed,
						lastQuotaResetDate: aggregatorQuotaResetDate,
					},
				};
			});
			logger.info(
				"💾 Saved updated subscription metadata (preserving",
				Object.keys(aggregatorRedirects).length,
				"redirects)",
			);

			// Save to file
			await store.writeVideoCache({
				videos: archivedVideosWithShortsStatus,
				lastUpdated: new Date().toISOString(),
				totalChannels: subscriptions.length,
				totalVideos: archivedVideosWithShortsStatus.length,
				shortsStatusById,
				channelRefreshes: mergeChannelRefreshes(
					channelRefreshes,
					new Set(subscriptions.map((sub) => sub.id)),
					[],
					new Date().toISOString(),
				),
			});

			aggregationStatus = {
				state: "idle",
				current: subscriptions.length,
				total: subscriptions.length,
				videos: archivedVideosWithShortsStatus.length,
				errors: failedChannels.length,
				failedChannels,
				outcomes: countRefreshOutcomes(fetchedChannelResults),
				startedAt: aggregationStartedAt,
				completedAt: new Date().toISOString(),
				lastUpdated: new Date().toISOString(),
			};

			logger.info(
				`✅ Aggregation complete: ${archivedVideosWithShortsStatus.length} archived videos from ${subscriptions.length} channels`,
			);
			scheduleArchivedShortsStatusBackfill(
				archivedVideosWithShortsStatus,
				shortsStatusById,
			);
		} catch (error) {
			aggregationStatus = {
				...aggregationStatus,
				state: "error",
				errors: aggregationStatus.errors + 1,
				failedChannels: aggregationStatus.failedChannels || [],
				completedAt: new Date().toISOString(),
				lastUpdated: new Date().toISOString(),
			};
			logger.error("❌ Aggregation failed:", error);
		}
	}

	async function aggregateFeeds() {
		if (aggregationPromise) {
			aggregationStatus = {
				...aggregationStatus,
				lastUpdated: new Date().toISOString(),
			};
			logger.info(
				"⏳ Feed aggregation already running; joining active refresh.",
			);
			return aggregationPromise;
		}

		aggregationPromise = (async () => {
			try {
				await runAggregation();
			} finally {
				aggregationPromise = null;
			}
		})();

		return aggregationPromise;
	}

	function getAggregationStatus() {
		return {
			...aggregationStatus,
			scheduledRefresh: { ...scheduledRefreshStatus },
		};
	}

	async function getActiveChannels({ limit = 5 } = {}) {
		try {
			const [data, videoCache] = await Promise.all([
				store.readData(DEFAULT_DATA),
				store.readVideoCache({ videos: [] }),
			]);
			return getNextChannelsForRefresh(
				data.subscriptions || [],
				videoCache.channelRefreshes || {},
				{ limit },
			);
		} catch (error) {
			logger.warn("Failed to compute active channels:", error.message);
			return [];
		}
	}

	async function aggregateOnStartupIfStale() {
		const scheduledConfig = getScheduledRefreshConfig();
		if (!scheduledConfig.refreshOnStartup) {
			logger.info(
				"⏭️ Startup feed refresh disabled by FEED_REFRESH_ON_START=false",
			);
			return;
		}

		try {
			const [data, videoCache] = await Promise.all([
				store.readData(DEFAULT_DATA),
				store.readVideoCache(null),
			]);

			const subscriptionCount = data.subscriptions?.length || 0;
			const cacheAge = videoCache?.lastUpdated
				? Date.now() - new Date(videoCache.lastUpdated).getTime()
				: Infinity;
			const cacheMatchesSubscriptions =
				videoCache?.totalChannels === subscriptionCount;
			const cacheHasVideos = (videoCache?.totalVideos || 0) > 0;
			const shortsStatusCount = Object.keys(
				videoCache?.shortsStatusById || {},
			).length;
			const cacheHasCompleteShortsMetadata =
				shortsStatusCount >= (videoCache?.totalVideos || 0);

			if (
				cacheMatchesSubscriptions &&
				cacheHasVideos &&
				cacheHasCompleteShortsMetadata &&
				cacheAge < STARTUP_CACHE_MAX_AGE_MS
			) {
				aggregationStatus = {
					state: "idle",
					current: subscriptionCount,
					total: subscriptionCount,
					videos: videoCache.totalVideos,
					errors: 0,
					startedAt: null,
					completedAt: videoCache.lastUpdated,
					lastUpdated: videoCache.lastUpdated,
				};
				logger.info(
					`✅ Using fresh video cache: ${videoCache.totalVideos} videos from ${videoCache.totalChannels} channels`,
				);
				return;
			}

			if (
				cacheMatchesSubscriptions &&
				cacheHasVideos &&
				!cacheHasCompleteShortsMetadata
			) {
				logger.info(
					`🩳 Video cache has Shorts metadata for ${shortsStatusCount}/${videoCache.totalVideos || 0} videos; refreshing to finish Shorts filter data`,
				);
			}
		} catch (err) {
			logger.warn(
				"Could not check startup video cache, refreshing feeds:",
				err.message,
			);
		}

		aggregateFeeds();
	}

	function stopScheduledRefresh() {
		if (scheduledRefreshTimer) {
			clearTimeout(scheduledRefreshTimer);
			scheduledRefreshTimer = null;
		}

		scheduledRefreshStatus = {
			...scheduledRefreshStatus,
			enabled: false,
			nextRunAt: null,
		};
	}

	function startScheduledRefresh(
		config = getScheduledRefreshConfig(),
		deps = {},
	) {
		stopScheduledRefresh();
		const runRefresh = deps.aggregateFeeds || aggregateFeeds;

		scheduledRefreshStatus = {
			enabled: config.enabled,
			intervalMs: config.intervalMs,
			nextRunAt: null,
			lastRunAt: null,
		};

		if (!config.enabled) {
			logger.info(
				"⏭️ Scheduled feed refresh disabled by FEED_REFRESH_ENABLED=false",
			);
			return scheduledRefreshStatus;
		}

		let scheduledRunPromise = null;
		const scheduleNext = () => {
			const nextRunTime = Date.now() + config.intervalMs;
			scheduledRefreshStatus = {
				...scheduledRefreshStatus,
				enabled: true,
				intervalMs: config.intervalMs,
				nextRunAt: new Date(nextRunTime).toISOString(),
			};

			scheduledRefreshTimer = setTimeout(() => {
				if (scheduledRunPromise) {
					scheduleNext();
					return;
				}

				scheduledRefreshStatus = {
					...scheduledRefreshStatus,
					lastRunAt: new Date().toISOString(),
					nextRunAt: null,
				};
				scheduledRunPromise = runRefresh({ force: true, reason: "scheduled" })
					.catch((err) => logger.error("Scheduled aggregation failed:", err))
					.finally(() => {
						scheduledRunPromise = null;
					});
				scheduleNext();
			}, config.intervalMs);

			scheduledRefreshTimer.unref?.();
		};

		scheduleNext();
		logger.info(
			`⏱️ Scheduled feed refresh every ${Math.round(config.intervalMs / 60000)} minutes`,
		);
		return scheduledRefreshStatus;
	}

	function start() {
		aggregateOnStartupIfStale();
		startScheduledRefresh();
	}

	return {
		runAggregation,
		aggregateFeeds,
		aggregateOnStartupIfStale,
		getActiveChannels,
		getAggregationStatus,
		getChannelsDueForRefresh,
		getScheduledRefreshConfig,
		refreshBatch,
		start,
		startScheduledRefresh,
		stopScheduledRefresh,
		mergeChannelRefreshes,
		summarizeFailedChannels,
		backfillArchivedShortsStatus,
		isArchivedShortsBackfillDue,
		startArchivedShortsStatusBackfill,
	};
}

const aggregator = createFeedAggregator();

module.exports = {
	ARCHIVED_SHORTS_BACKFILL_RETRY_INTERVAL_MS,
	CHANNEL_REFRESH_INTERVAL_MS,
	DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
	...aggregator,
	buildVideoFromFeedItem,
	fetchChannelFeed,
	getNextChannelsForRefresh,
	resolveYouTubeShortsStatus,
	enrichVideosWithShortsStatus,
	backfillArchivedShortsStatus,
	isArchivedShortsBackfillDue,
	applyLocalShortsMetadata,
	looksLikeShortByLocalMetadata,
	createFeedAggregator,
	__test__: {
		createFeedAggregator,
		getActiveChannels: aggregator.getActiveChannels,
		refreshBatch: aggregator.refreshBatch,
		getAggregationStatus: aggregator.getAggregationStatus,
		runAggregation: aggregator.runAggregation,
		aggregateFeeds: aggregator.aggregateFeeds,
		aggregateOnStartupIfStale: aggregator.aggregateOnStartupIfStale,
	},
};
