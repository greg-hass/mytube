const axios = require('axios');
const path = require('path');
const { readJson, writeJsonQueued } = require('./json-store');
const { mergeVideoArchive } = require('./video-archive');
const {
    buildVideoFromFeedItem,
    fetchChannelFeed,
    fetchChannelThumbnail,
    parseDuration,
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
    applyLocalShortsMetadata,
    backfillArchivedShortsStatus,
    enrichVideosWithShortsStatus,
    looksLikeShortByLocalMetadata,
    resolveYouTubeShortsStatus,
} = require('./shorts-status');
const {
    applySubscriptionRedirects,
    resolveTemporarySubscriptions,
} = require('./subscription-resolver');

const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const VIDEOS_FILE = path.join(__dirname, 'data', 'videos.json');
const BATCH_SIZE = 5;
const BATCH_DELAY = 2000; // 2 seconds between batches
const MAX_ARCHIVED_VIDEOS = 5000;
const API_RESOLVER_DAILY_QUOTA_CAP = 100;
const STARTUP_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_DATA = { subscriptions: [], settings: {}, watchedVideos: [], redirects: {} };
let aggregationPromise = null;
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

function getCurrentPacificDate() {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).format(new Date());
}

async function runAggregation(options = {}) {
    console.log('🔄 Starting feed aggregation...');

    try {
        // Read data to get subscriptions and settings
        const parsedData = await readJson(DATA_FILE, DEFAULT_DATA);
        const subscriptions = parsedData.subscriptions || [];
        const existingVideoCache = await readJson(VIDEOS_FILE, { videos: [] });
        let existingVideos = existingVideoCache.videos || [];
        const shortsStatusById = existingVideoCache.shortsStatusById || {};
        applyLocalShortsMetadata(existingVideos, shortsStatusById);
        existingVideos = existingVideos.map((video) => (
            video?.id && typeof shortsStatusById[video.id] === 'boolean'
                ? { ...video, isShort: shortsStatusById[video.id] }
                : video
        ));
        let channelRefreshes = existingVideoCache.channelRefreshes || {};
        const apiKey = parsedData.settings?.apiKey;
        if (!parsedData.settings) parsedData.settings = {};

        const currentPacificDate = getCurrentPacificDate();
        if (parsedData.settings.lastQuotaResetDate !== currentPacificDate) {
            parsedData.settings.quotaUsed = 0;
            parsedData.settings.lastQuotaResetDate = currentPacificDate;
        }

        const startingResolverQuota = Number(parsedData.settings?.quotaUsed || 0);
        let resolverQuotaUsed = startingResolverQuota;
        const useResolverApi = Boolean(apiKey && resolverQuotaUsed < API_RESOLVER_DAILY_QUOTA_CAP);
        const useApiForVideoFetching = false;

        if (apiKey && useResolverApi) console.log('🔑 API key available for capped handle resolution only; videos use RSS');
        else if (apiKey) console.log('ℹ️ API resolver quota cap reached or unavailable; using RSS/public fallbacks only');

        const allVideos = [];
        let failedChannels = [];
        const fetchedChannelResults = [];
        let quotaExceeded = false;

        const redirectResult = applySubscriptionRedirects(subscriptions, parsedData.redirects || {});
        if (redirectResult.changed) {
            parsedData.subscriptions = redirectResult.subscriptions;
            await writeJsonQueued(DATA_FILE, parsedData);
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
                await writeJsonQueued(DATA_FILE, parsedData);
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

        aggregationStatus = {
            state: 'running',
            current: skippedChannels,
            total: subscriptions.length,
            videos: existingVideos.length,
            errors: 0,
            failedChannels: [],
            startedAt: new Date().toISOString(),
            completedAt: null,
            lastUpdated: new Date().toISOString(),
        };

        // Process in batches
        const CURRENT_BATCH_SIZE = BATCH_SIZE;

        for (let i = 0; i < subscriptionsToRefresh.length; i += CURRENT_BATCH_SIZE) {
            const batch = subscriptionsToRefresh.slice(i, i + CURRENT_BATCH_SIZE);

            let batchVideos = [];
            const batchRefreshResults = [];

            if (useApiForVideoFetching && !quotaExceeded) {
                // Use YouTube API (unless quota was already exceeded in a previous batch)
                try {
                    // Filter out any non-UC IDs (like handles that failed resolution) to prevent API errors
                    const validIds = batch.map(sub => sub.id).filter(id => id.startsWith('UC'));

                    if (validIds.length === 0) {
                        // All IDs in this batch are invalid/handles, fallback to RSS
                        throw new Error('No valid UC IDs in batch');
                    }

                    const channelIds = validIds.join(',');
                    // First get uploads playlist IDs (cost: 1 unit)
                    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${channelIds}&key=${apiKey}`;
                    const channelsRes = await axios.get(channelsUrl);

                    const channelMap = new Map();
                    channelsRes.data.items?.forEach(item => {
                        const thumbnail = item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url;
                        const title = item.snippet.title;

                        channelMap.set(item.id, {
                            uploadsId: item.contentDetails.relatedPlaylists.uploads,
                            thumbnail,
                            title
                        });

                        // Update subscription metadata
                        const subIndex = subscriptions.findIndex(s => s.id === item.id);
                        if (subIndex !== -1) {
                            if (title) subscriptions[subIndex].title = title;
                            if (thumbnail) {
                                subscriptions[subIndex].thumbnail = thumbnail;
                                // Log occasionally to avoid spam, or log all for debugging
                                console.log(`    ✓ API: Updated thumbnail for ${item.id}`);
                            }
                        }
                    });

                    // Fetch videos for each channel's upload playlist
                    // We can't batch playlistItems across different playlists easily without multiple requests.
                    // But we can do them in parallel.
                    const playlistPromises = batch.map(async (sub) => {
                        const channelInfo = channelMap.get(sub.id);
                        if (!channelInfo?.uploadsId) {
                            const { videos } = await fetchChannelFeed(sub.id);
                            return videos;
                        }

                        try {
                            const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${channelInfo.uploadsId}&maxResults=10&key=${apiKey}`;
                            const playlistRes = await axios.get(playlistUrl);

                            return playlistRes.data.items.map(item => ({
                                id: item.contentDetails.videoId,
                                title: item.snippet.title,
                                channelId: item.snippet.channelId,
                                channelTitle: item.snippet.channelTitle,
                                publishedAt: item.snippet.publishedAt,
                                thumbnail: item.snippet.thumbnails.maxres?.url ||
                                    item.snippet.thumbnails.high?.url ||
                                    item.snippet.thumbnails.medium?.url ||
                                    `https://i.ytimg.com/vi/${item.contentDetails.videoId}/hqdefault.jpg`,
                                description: item.snippet.description,
                                liveBroadcastContent: item.snippet.liveBroadcastContent,
                                isLive: item.snippet.liveBroadcastContent === 'live',
                                duration: null // We'd need another call for duration, skip for now or add later
                            }));
                        } catch (err) {
                            console.error(`Failed to fetch playlist for ${sub.id}, falling back to RSS`, err.message);
                            const { videos } = await fetchChannelFeed(sub.id);
                            return videos;
                        }
                    });

                    const batchResults = await Promise.all(playlistPromises);

                    // Flatten results
                    batchResults.forEach(videos => batchVideos.push(...videos));

                    // Fetch durations for these videos using the 'videos' endpoint
                    // We can fetch up to 50 IDs at once
                    const videoIds = batchVideos.map(v => v.id);
                    if (videoIds.length > 0) {
                        try {
                            // Split into chunks of 50
                            const chunkSize = 50;
                            for (let k = 0; k < videoIds.length; k += chunkSize) {
                                const chunkIds = videoIds.slice(k, k + chunkSize);
                                const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${chunkIds.join(',')}&key=${apiKey}`;
                                const videosRes = await axios.get(videosUrl);

                                videosRes.data.items?.forEach(item => {
                                    const video = batchVideos.find(v => v.id === item.id);
                                    if (video) {
                                        video.duration = parseDuration(item.contentDetails.duration);
                                        video.liveBroadcastContent = item.snippet?.liveBroadcastContent || video.liveBroadcastContent;
                                        video.isLive = video.liveBroadcastContent === 'live';
                                    }
                                });
                            }
                            console.log(`    ✓ API: Fetched details (duration) for ${videoIds.length} videos`);
                        } catch (err) {
                            console.error('    ⚠ API: Failed to fetch video durations:', err.message);
                        }
                    }

                    const fetchedCount = batchVideos.length;
                    console.log(`  ✨ API Batch: Fetched ${fetchedCount} videos from ${batch.length} channels`);

                } catch (err) {
                    console.error('API batch error, falling back to pure RSS:', err.message, err.response?.data?.error);

                    // Check for quota exceeded
                    if (err.response?.status === 403 ||
                        err.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded' ||
                        err.message?.includes('403')) {
                        console.warn('⚠️ API Quota limit reached (403)! Switching to RSS for all remaining batches.');
                        // We will update the file at the end of the function
                        quotaExceeded = true;
                    }

                    // Fallback to RSS with delay to avoid 429s
                    for (const sub of batch) {
                        const feedResult = await fetchChannelFeed(sub.id);
                        const { videos, channelMetadata } = feedResult;
                        const refreshResult = { ...sub, expected: true, source: 'rss', ...feedResult };
                        batchRefreshResults.push(refreshResult);
                        fetchedChannelResults.push(refreshResult);
                        batchVideos.push(...videos);

                        // Update subscription metadata if we got it from RSS
                        if (channelMetadata && channelMetadata.title) {
                            const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                            if (subIndex !== -1) {
                                subscriptions[subIndex].title = channelMetadata.title;
                            }
                        }

                        // Small delay between RSS fetches in fallback mode
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Fetch thumbnails in parallel for this batch
                    console.log(`  🖼️  Fetching thumbnails for ${batch.length} channels...`);
                    const thumbnailPromises = batch.map(async (sub, idx) => {
                        const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                        console.log(`    [${idx}] ${sub.id}: subIndex=${subIndex}, hasThumbnail=${!!subscriptions[subIndex]?.thumbnail}`);

                        if (subIndex !== -1 && (!subscriptions[subIndex].thumbnail || subscriptions[subIndex].thumbnail.includes('ui-avatars'))) {
                            try {
                                console.log(`    [${idx}] Fetching thumbnail for ${sub.id}...`);
                                const thumbnail = await fetchChannelThumbnail(sub.id);
                                if (thumbnail) {
                                    subscriptions[subIndex].thumbnail = thumbnail;
                                    console.log(`    ✓ ${sub.id}: Got thumbnail`);
                                } else {
                                    console.log(`    ✗ ${sub.id}: No thumbnail found`);
                                }
                            } catch (err) {
                                console.error(`    ✗ ${sub.id}: Error -`, err.message);
                            }
                        } else {
                            console.log(`    [${idx}] Skipping ${sub.id} (already has thumbnail or not found)`);
                        }
                    });
                    await Promise.all(thumbnailPromises);
                }
            } else if (quotaExceeded) {
                // Quota was exceeded in a previous batch, use RSS for remaining batches
                console.log(`  📡 RSS Mode: Fetching ${batch.length} channels (quota exhausted)`);
                for (const sub of batch) {
                    const feedResult = await fetchChannelFeed(sub.id);
                    const { videos, channelMetadata } = feedResult;
                    const refreshResult = { ...sub, expected: true, source: 'rss', ...feedResult };
                    batchRefreshResults.push(refreshResult);
                    fetchedChannelResults.push(refreshResult);
                    batchVideos.push(...videos);

                    // Update subscription metadata if we got it from RSS
                    if (channelMetadata && channelMetadata.title) {
                        const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                        if (subIndex !== -1) {
                            subscriptions[subIndex].title = channelMetadata.title;
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Fetch thumbnails in parallel for this batch
                const thumbnailPromises = batch.map(async sub => {
                    const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                    if (subIndex !== -1 && (!subscriptions[subIndex].thumbnail || subscriptions[subIndex].thumbnail.includes('ui-avatars'))) {
                        const thumbnail = await fetchChannelThumbnail(sub.id);
                        if (thumbnail) {
                            subscriptions[subIndex].thumbnail = thumbnail;
                        }
                    }
                });
                await Promise.all(thumbnailPromises);
            } else {
                // RSS Only
                const batchPromises = batch.map(async sub => {
                    const feedResult = await fetchChannelFeed(sub.id);
                    const { videos, channelMetadata } = feedResult;
                    const refreshResult = { ...sub, expected: true, source: 'rss', ...feedResult };
                    batchRefreshResults.push(refreshResult);
                    fetchedChannelResults.push(refreshResult);

                    // Update subscription metadata if we got it from RSS
                    if (channelMetadata && channelMetadata.title) {
                        const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                        if (subIndex !== -1) {
                            subscriptions[subIndex].title = channelMetadata.title;
                        }
                    }

                    return videos;
                });
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(videos => batchVideos.push(...videos));

                // Fetch thumbnails in parallel for this batch
                const thumbnailPromises = batch.map(async sub => {
                    const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                    if (subIndex !== -1 && (!subscriptions[subIndex].thumbnail || subscriptions[subIndex].thumbnail.includes('ui-avatars'))) {
                        const thumbnail = await fetchChannelThumbnail(sub.id);
                        if (thumbnail) {
                            subscriptions[subIndex].thumbnail = thumbnail;
                        }
                    }
                });
                await Promise.all(thumbnailPromises);
            }

            await enrichVideosWithShortsStatus(batchVideos, shortsStatusById);
            allVideos.push(...batchVideos);

            const currentVideos = mergeVideoArchive(existingVideos, allVideos, {
                activeChannelIds: new Set(subscriptions.map(sub => sub.id)),
                maxVideos: MAX_ARCHIVED_VIDEOS,
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

            await writeJsonQueued(VIDEOS_FILE, {
                videos: currentVideos,
                lastUpdated: new Date().toISOString(),
                totalChannels: subscriptions.length,
                totalVideos: currentVideos.length,
                channelRefreshes,
                shortsStatusById
            });

            console.log(`Progress: ${Math.min(skippedChannels + i + CURRENT_BATCH_SIZE, subscriptions.length)}/${subscriptions.length}`);

            // Delay between batches
            if (i + CURRENT_BATCH_SIZE < subscriptionsToRefresh.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        const archivedVideos = mergeVideoArchive(existingVideos, allVideos, {
            activeChannelIds: new Set(subscriptions.map(sub => sub.id)),
            maxVideos: MAX_ARCHIVED_VIDEOS,
        });
        await backfillArchivedShortsStatus(archivedVideos, shortsStatusById);
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
        await writeJsonQueued(DATA_FILE, parsedData);
        console.log('💾 Saved updated subscription metadata (preserving', Object.keys(parsedData.redirects).length, 'redirects)');

        // Save to file
        await writeJsonQueued(VIDEOS_FILE, {
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
            startedAt: aggregationStatus.startedAt,
            completedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
        };

        // Update quota usage in db.json if we used API
        if (useApiForVideoFetching) {
            // Calculate quota used:
            // 1 unit for channels list
            // 1 unit per playlist fetch (we did 1 fetch per channel that had uploads)
            // Note: This is an approximation.
            const quotaCost = 1 + subscriptions.length;

            // Read fresh data to avoid race conditions (though we are single threaded mostly)
            const currentData = await readJson(DATA_FILE, DEFAULT_DATA);

            // Initialize if missing
            if (!currentData.settings) currentData.settings = {};
            if (!currentData.settings.quotaUsed) currentData.settings.quotaUsed = 0;

            // Update API Status based on actual results (403 vs 200)
            if (quotaExceeded) {
                // We hit a 403 error
                currentData.settings.apiExhausted = true;
                // Force counter to max for legacy compatibility
                currentData.settings.quotaUsed = 10000;
                console.log(`📊 API Status: EXHAUSTED (403 received).`);
            } else {
                // We successfully used the API
                currentData.settings.apiExhausted = false;

                // If we successfully used the API but the counter is huge (e.g. from yesterday or not reset),
                // and we didn't hit the limit, then the counter is wrong. Reset it to just this run's cost.
                if (currentData.settings.quotaUsed >= 10000) {
                    console.log(`📊 API working but quota counter high (${currentData.settings.quotaUsed}). Resetting counter.`);
                    currentData.settings.quotaUsed = 0;
                }

                currentData.settings.quotaUsed += quotaCost;
                console.log(`📊 API Status: ACTIVE. Quota used this run: ${quotaCost}. Total: ${currentData.settings.quotaUsed}`);
            }

            await writeJsonQueued(DATA_FILE, currentData);
        }

        console.log(`✅ Aggregation complete: ${archivedVideosWithShortsStatus.length} archived videos from ${subscriptions.length} channels`);
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
            readJson(DATA_FILE, DEFAULT_DATA),
            readJson(VIDEOS_FILE, null),
        ]);

        const subscriptionCount = data.subscriptions?.length || 0;
        const cacheAge = videoCache?.lastUpdated
            ? Date.now() - new Date(videoCache.lastUpdated).getTime()
            : Infinity;
        const cacheMatchesSubscriptions = videoCache?.totalChannels === subscriptionCount;
        const cacheHasVideos = (videoCache?.totalVideos || 0) > 0;
        const cacheHasShortsMetadata = Object.keys(videoCache?.shortsStatusById || {}).length > 0;

        if (cacheMatchesSubscriptions && cacheHasVideos && cacheHasShortsMetadata && cacheAge < STARTUP_CACHE_MAX_AGE_MS) {
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

        if (cacheMatchesSubscriptions && cacheHasVideos && !cacheHasShortsMetadata) {
            console.log('🩳 Video cache is missing Shorts metadata; refreshing to backfill Shorts filter data');
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

// Run immediately on start when enabled
aggregateOnStartupIfStale();
startScheduledRefresh();

module.exports = {
    CHANNEL_REFRESH_INTERVAL_MS,
    DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
    aggregateFeeds,
    getAggregationStatus,
    getChannelsDueForRefresh,
    getScheduledRefreshConfig,
    startScheduledRefresh,
    stopScheduledRefresh,
    mergeChannelRefreshes,
    summarizeFailedChannels,
    buildVideoFromFeedItem,
    fetchChannelFeed,
    resolveYouTubeShortsStatus,
    enrichVideosWithShortsStatus,
    backfillArchivedShortsStatus,
    applyLocalShortsMetadata,
    looksLikeShortByLocalMetadata
};
