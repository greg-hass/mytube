const appStore = require('./app-store');
const { mergeVideoArchive } = require('./video-archive');
const {
    buildVideoFromFeedItem,
    fetchChannelFeed,
    fetchChannelThumbnail,
} = require('./feed-fetcher');
const {
    CHANNEL_REFRESH_INTERVAL_MS,
    DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
    getChannelsDueForRefresh,
    getScheduledRefreshConfig,
    mergeChannelRefreshes,
    summarizeFailedChannels,
} = require('./feed-refresh-policy');
const {
    ARCHIVED_SHORTS_BACKFILL_RETRY_INTERVAL_MS,
    applyLocalShortsMetadata,
    backfillArchivedShortsStatus,
    enrichVideosWithShortsStatus,
    isArchivedShortsBackfillDue,
    looksLikeShortByLocalMetadata,
    resolveYouTubeShortsStatus,
    startArchivedShortsStatusBackfill,
} = require('./shorts-status');
const {
    applySubscriptionRedirects,
    resolveTemporarySubscriptions,
} = require('./subscription-resolver');

const BATCH_SIZE = 15;
const BATCH_DELAY = 500; // 500ms between batches
const MAX_ARCHIVED_VIDEOS = 5000;
const API_RESOLVER_DAILY_QUOTA_CAP = 100;
const STARTUP_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_DATA = { subscriptions: [], settings: {}, watchedVideos: [], redirects: {} };

function createFeedAggregator() {
    let aggregationPromise = null;
    let archivedShortsBackfillPromise = null;
    let archivedShortsBackfillLastAttemptAt = null;
    let rerunRequested = false;
    let queuedAggregationOptions = {};
    let scheduledRefreshTimer = null;
    let scheduledRefreshStatus = {
        enabled: false,
        intervalMs: DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
        nextRunAt: null,
        lastRunAt: null,
    };
    let aggregationStatus = {
        state: 'idle',
        current: 0,
        total: 0,
        videos: 0,
        errors: 0,
        failedChannels: [],
        startedAt: null,
        completedAt: null,
        lastUpdated: null,
    };
    
    function scheduleArchivedShortsStatusBackfill(archivedVideos, shortsStatusById) {
        if (archivedShortsBackfillPromise) return;
    
        const hasUncheckedVideos = archivedVideos.some(
            (video) => video?.id && typeof shortsStatusById[video.id] !== 'boolean'
        );
        if (!hasUncheckedVideos) return;
        if (!isArchivedShortsBackfillDue(archivedShortsBackfillLastAttemptAt)) return;
    
        archivedShortsBackfillLastAttemptAt = Date.now();
        archivedShortsBackfillPromise = startArchivedShortsStatusBackfill(
            archivedVideos,
            { ...shortsStatusById },
            {
                onComplete: async (completedStatuses) => {
                    const latestVideoCache = await appStore.readVideoCache({ videos: [] });
                    const mergedStatuses = {
                        ...(latestVideoCache.shortsStatusById || {}),
                        ...completedStatuses,
                    };
                    const latestVideos = latestVideoCache.videos || [];
                    applyLocalShortsMetadata(latestVideos, mergedStatuses);
    
                    await appStore.writeVideoCache({
                        ...latestVideoCache,
                        videos: latestVideos,
                        shortsStatusById: mergedStatuses,
                    });
                    aggregationStatus = {
                        ...aggregationStatus,
                        lastUpdated: new Date().toISOString(),
                    };
                    console.log('✅ Archived Shorts metadata backfill saved');
                },
            }
        ).finally(() => {
            archivedShortsBackfillPromise = null;
        });
    }
    
    function getCurrentPacificDate() {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
        }).format(new Date());
    }

    async function refreshBatch(batch, subscriptions, fetchedChannelResults, deps = {}) {
        const feedFetcher = deps.fetchChannelFeed || fetchChannelFeed;
        const thumbnailFetcher = deps.fetchChannelThumbnail || fetchChannelThumbnail;
        const batchRefreshResults = [];
        const batchVideos = [];

        const batchPromises = batch.map(async (sub) => {
            const feedResult = await feedFetcher(sub.id);
            const { videos, channelMetadata } = feedResult;
            const refreshResult = { ...sub, expected: true, source: 'rss', ...feedResult };
            batchRefreshResults.push(refreshResult);
            fetchedChannelResults.push(refreshResult);

            if (channelMetadata && channelMetadata.title) {
                const subIndex = subscriptions.findIndex((subscription) => subscription.id === sub.id);
                if (subIndex !== -1) {
                    subscriptions[subIndex].title = channelMetadata.title;
                }
            }

            return videos;
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach((videos) => batchVideos.push(...videos));

        const thumbnailPromises = batch.map(async (sub) => {
            const subIndex = subscriptions.findIndex((subscription) => subscription.id === sub.id);
            if (subIndex !== -1 && (!subscriptions[subIndex].thumbnail || subscriptions[subIndex].thumbnail.includes('ui-avatars'))) {
                const thumbnail = await thumbnailFetcher(sub.id);
                if (thumbnail) {
                    subscriptions[subIndex].thumbnail = thumbnail;
                }
            }
        });

        await Promise.all(thumbnailPromises);

        return { batchRefreshResults, batchVideos };
    }

    function setRunningAggregationStatus({ skippedChannels, subscriptions, existingVideos, startedAt }) {
        aggregationStatus = {
            state: 'running',
            current: skippedChannels,
            total: subscriptions.length,
            videos: existingVideos.length,
            errors: 0,
            failedChannels: [],
            startedAt,
            completedAt: null,
            lastUpdated: new Date().toISOString(),
        };
    }
    
    async function runAggregation(options = {}) {
        if (archivedShortsBackfillPromise) {
            aggregationStatus = {
                ...aggregationStatus,
                state: 'queued',
                lastUpdated: new Date().toISOString(),
            };
            console.log('⏳ Waiting for archived Shorts metadata maintenance before the next refresh.');
            await archivedShortsBackfillPromise;
        }
    
        console.log('🔄 Starting feed aggregation...');
    
        try {
            // Read data to get subscriptions and settings
            const parsedData = await appStore.readData(DEFAULT_DATA);
            const subscriptions = parsedData.subscriptions || [];
            const existingVideoCache = await appStore.readVideoCache({ videos: [] });
            let existingVideos = existingVideoCache.videos || [];
            const shortsStatusById = existingVideoCache.shortsStatusById || {};
            applyLocalShortsMetadata(existingVideos, shortsStatusById);
            existingVideos = existingVideos.map((video) => (
                video?.id && typeof shortsStatusById[video.id] === 'boolean'
                    ? { ...video, isShort: shortsStatusById[video.id] }
                    : video
            ));
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
            const useResolverApi = Boolean(apiKey && resolverQuotaUsed < API_RESOLVER_DAILY_QUOTA_CAP);
    
            if (apiKey && useResolverApi) console.log('🔑 API key available for capped handle resolution only; videos use RSS');
            else if (apiKey) console.log('ℹ️ API resolver quota cap reached or unavailable; using RSS/public fallbacks only');
    
            const allVideos = [];
            let failedChannels = [];
            const fetchedChannelResults = [];
    
            const redirectResult = applySubscriptionRedirects(subscriptions, parsedData.redirects || {});
            if (redirectResult.changed) {
                parsedData.subscriptions = redirectResult.subscriptions;
                await appStore.writeData(parsedData);
                console.log('💾 Updated subscriptions with redirects');
                subscriptions.length = 0;
                subscriptions.push(...redirectResult.subscriptions);
            }
    
            if (useResolverApi) {
                if (!parsedData.redirects) parsedData.redirects = {};
                const resolveResult = await resolveTemporarySubscriptions(subscriptions, {
                    apiKey,
                    redirects: parsedData.redirects,
                    resolverQuotaUsed,
                    quotaCap: API_RESOLVER_DAILY_QUOTA_CAP,
                });
                resolverQuotaUsed = resolveResult.resolverQuotaUsed;
                parsedData.settings.quotaUsed = resolverQuotaUsed;
    
                if (resolveResult.changed) {
                    parsedData.subscriptions = resolveResult.subscriptions;
                    await appStore.writeData(parsedData);
                    console.log('💾 Updated subscriptions with resolved IDs');
                    subscriptions.length = 0;
                    subscriptions.push(...resolveResult.subscriptions);
                }
            }
    
            const subscriptionsToRefresh = getChannelsDueForRefresh(
                subscriptions,
                channelRefreshes,
                { force: options.force }
            );
            const skippedChannels = subscriptions.length - subscriptionsToRefresh.length;
    
            if (skippedChannels > 0 && !options.force) {
                console.log(`⚡ RSS cache: skipping ${skippedChannels} recently checked channels; ${subscriptionsToRefresh.length} due`);
            }
    
            const aggregationStartedAt = new Date().toISOString();
            setRunningAggregationStatus({
                skippedChannels,
                subscriptions,
                existingVideos,
                startedAt: aggregationStartedAt,
            });
    
            // Process in batches
            const CURRENT_BATCH_SIZE = BATCH_SIZE;
    
            for (let i = 0; i < subscriptionsToRefresh.length; i += CURRENT_BATCH_SIZE) {
                const batch = subscriptionsToRefresh.slice(i, i + CURRENT_BATCH_SIZE);
    
                const { batchRefreshResults, batchVideos } = await refreshBatch(
                    batch,
                    subscriptions,
                    fetchedChannelResults
                );
    
                await enrichVideosWithShortsStatus(batchVideos, shortsStatusById);
                allVideos.push(...batchVideos);
    
                const currentVideos = mergeVideoArchive(existingVideos, allVideos, {
                    activeChannelIds: new Set(subscriptions.map(sub => sub.id)),
                    maxVideos: MAX_ARCHIVED_VIDEOS,
                    cacheUpdatedAt: existingVideoCache.lastUpdated,
                });
                channelRefreshes = mergeChannelRefreshes(
                    channelRefreshes,
                    new Set(subscriptions.map(sub => sub.id)),
                    batchRefreshResults.length > 0 ? batchRefreshResults : batch,
                    new Date().toISOString()
                );
                failedChannels = summarizeFailedChannels(fetchedChannelResults, channelRefreshes);
    
                aggregationStatus = {
                    ...aggregationStatus,
                    current: Math.min(skippedChannels + i + CURRENT_BATCH_SIZE, subscriptions.length),
                    videos: currentVideos.length,
                    errors: failedChannels.length,
                    failedChannels,
                    lastUpdated: new Date().toISOString(),
                };
    
                // Write cache every 5 batches or on the last batch to reduce I/O
                const batchNumber = Math.floor(i / CURRENT_BATCH_SIZE) + 1;
                const isLastBatch = i + CURRENT_BATCH_SIZE >= subscriptionsToRefresh.length;
                if (batchNumber % 5 === 0 || isLastBatch) {
                    await appStore.writeVideoCache({
                        videos: currentVideos,
                        lastUpdated: new Date().toISOString(),
                        totalChannels: subscriptions.length,
                        totalVideos: currentVideos.length,
                        channelRefreshes,
                        shortsStatusById
                    });
                }
    
                console.log(`Progress: ${Math.min(skippedChannels + i + CURRENT_BATCH_SIZE, subscriptions.length)}/${subscriptions.length}`);
    
                // Delay between batches
                if (i + CURRENT_BATCH_SIZE < subscriptionsToRefresh.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
    
            const archivedVideos = mergeVideoArchive(existingVideos, allVideos, {
                activeChannelIds: new Set(subscriptions.map(sub => sub.id)),
                maxVideos: MAX_ARCHIVED_VIDEOS,
                cacheUpdatedAt: existingVideoCache.lastUpdated,
            });
            const archivedVideosWithShortsStatus = archivedVideos.map((video) => (
                video?.id && typeof shortsStatusById[video.id] === 'boolean'
                    ? { ...video, isShort: shortsStatusById[video.id] }
                    : video
            ));
    
            // Save updated subscriptions (with metadata from RSS) back to db.json
            // IMPORTANT: Preserve redirects that were merged during init()
            parsedData.subscriptions = subscriptions;
            if (!parsedData.redirects) {
                parsedData.redirects = {};
            }
            await appStore.writeData(parsedData);
            console.log('💾 Saved updated subscription metadata (preserving', Object.keys(parsedData.redirects).length, 'redirects)');
    
            // Save to file
            await appStore.writeVideoCache({
                videos: archivedVideosWithShortsStatus,
                lastUpdated: new Date().toISOString(),
                totalChannels: subscriptions.length,
                totalVideos: archivedVideosWithShortsStatus.length,
                shortsStatusById,
                channelRefreshes: mergeChannelRefreshes(
                    channelRefreshes,
                    new Set(subscriptions.map(sub => sub.id)),
                    [],
                    new Date().toISOString()
                )
            });
    
            aggregationStatus = {
                state: 'idle',
                current: subscriptions.length,
                total: subscriptions.length,
                videos: archivedVideosWithShortsStatus.length,
                errors: failedChannels.length,
                failedChannels,
                startedAt: aggregationStartedAt,
                completedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
            };
    
            console.log(`✅ Aggregation complete: ${archivedVideosWithShortsStatus.length} archived videos from ${subscriptions.length} channels`);
            scheduleArchivedShortsStatusBackfill(archivedVideosWithShortsStatus, shortsStatusById);
        } catch (error) {
            aggregationStatus = {
                ...aggregationStatus,
                state: 'error',
                errors: aggregationStatus.errors + 1,
                failedChannels: aggregationStatus.failedChannels || [],
                completedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
            };
            console.error('❌ Aggregation failed:', error);
        }
    }
    
    async function aggregateFeeds(options = {}) {
        if (aggregationPromise) {
            rerunRequested = true;
            queuedAggregationOptions = {
                ...queuedAggregationOptions,
                force: Boolean(queuedAggregationOptions.force || options.force),
            };
            aggregationStatus = {
                ...aggregationStatus,
                state: 'queued',
                lastUpdated: new Date().toISOString(),
            };
            console.log('⏳ Feed aggregation already running; queued one follow-up refresh.');
            return aggregationPromise;
        }
    
        aggregationPromise = (async () => {
            try {
                do {
                    const runOptions = {
                        ...options,
                        ...queuedAggregationOptions,
                        force: Boolean(options.force || queuedAggregationOptions.force),
                    };
                    queuedAggregationOptions = {};
                    rerunRequested = false;
                    await runAggregation(runOptions);
                } while (rerunRequested);
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
    
    async function aggregateOnStartupIfStale() {
        const scheduledConfig = getScheduledRefreshConfig();
        if (!scheduledConfig.refreshOnStartup) {
            console.log('⏭️ Startup feed refresh disabled by FEED_REFRESH_ON_START=false');
            return;
        }
    
        try {
            const [data, videoCache] = await Promise.all([
                appStore.readData(DEFAULT_DATA),
                appStore.readVideoCache(null),
            ]);
    
            const subscriptionCount = data.subscriptions?.length || 0;
            const cacheAge = videoCache?.lastUpdated
                ? Date.now() - new Date(videoCache.lastUpdated).getTime()
                : Infinity;
            const cacheMatchesSubscriptions = videoCache?.totalChannels === subscriptionCount;
            const cacheHasVideos = (videoCache?.totalVideos || 0) > 0;
            const shortsStatusCount = Object.keys(videoCache?.shortsStatusById || {}).length;
            const cacheHasCompleteShortsMetadata = shortsStatusCount >= (videoCache?.totalVideos || 0);
    
            if (cacheMatchesSubscriptions && cacheHasVideos && cacheHasCompleteShortsMetadata && cacheAge < STARTUP_CACHE_MAX_AGE_MS) {
                aggregationStatus = {
                    state: 'idle',
                    current: subscriptionCount,
                    total: subscriptionCount,
                    videos: videoCache.totalVideos,
                    errors: 0,
                    startedAt: null,
                    completedAt: videoCache.lastUpdated,
                    lastUpdated: videoCache.lastUpdated,
                };
                console.log(`✅ Using fresh video cache: ${videoCache.totalVideos} videos from ${videoCache.totalChannels} channels`);
                return;
            }
    
            if (cacheMatchesSubscriptions && cacheHasVideos && !cacheHasCompleteShortsMetadata) {
                console.log(`🩳 Video cache has Shorts metadata for ${shortsStatusCount}/${videoCache.totalVideos || 0} videos; refreshing to finish Shorts filter data`);
            }
        } catch (err) {
            console.warn('Could not check startup video cache, refreshing feeds:', err.message);
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
    
    function startScheduledRefresh(config = getScheduledRefreshConfig(), deps = {}) {
        stopScheduledRefresh();
        const runRefresh = deps.aggregateFeeds || aggregateFeeds;
    
        scheduledRefreshStatus = {
            enabled: config.enabled,
            intervalMs: config.intervalMs,
            nextRunAt: null,
            lastRunAt: null,
        };
    
        if (!config.enabled) {
            console.log('⏭️ Scheduled feed refresh disabled by FEED_REFRESH_ENABLED=false');
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
                scheduledRunPromise = runRefresh({ force: true, reason: 'scheduled' })
                    .catch(err => console.error('Scheduled aggregation failed:', err))
                    .finally(() => {
                        scheduledRunPromise = null;
                    });
                scheduleNext();
            }, config.intervalMs);
    
            scheduledRefreshTimer.unref?.();
        };
    
        scheduleNext();
        console.log(`⏱️ Scheduled feed refresh every ${Math.round(config.intervalMs / 60000)} minutes`);
        return scheduledRefreshStatus;
    }

    function start() {
        aggregateOnStartupIfStale();
        startScheduledRefresh();
    }

    return {
        aggregateFeeds,
        aggregateOnStartupIfStale,
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
    setRunningAggregationStatus,
    getAggregationStatus,
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
    resolveYouTubeShortsStatus,
    enrichVideosWithShortsStatus,
    backfillArchivedShortsStatus,
    isArchivedShortsBackfillDue,
    applyLocalShortsMetadata,
    looksLikeShortByLocalMetadata,
    __test__: {
        refreshBatch: aggregator.refreshBatch,
        setRunningAggregationStatus: aggregator.setRunningAggregationStatus,
        getAggregationStatus: aggregator.getAggregationStatus,
    },
};
