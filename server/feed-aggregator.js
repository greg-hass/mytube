const Parser = require('rss-parser');
const axios = require('axios');
const path = require('path');
const { readJson, writeJsonQueued } = require('./json-store');
const { mergeVideoArchive } = require('./video-archive');

const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader/1.0)'
    },
    customFields: {
        item: [
            ['media:group', 'mediaGroup'],
            ['yt:videoId', 'ytVideoId'],
            ['yt:channelId', 'ytChannelId']
        ]
    }
});

// Helper to parse ISO 8601 duration to seconds
function parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const VIDEOS_FILE = path.join(__dirname, 'data', 'videos.json');
const BATCH_SIZE = 5;
const BATCH_DELAY = 2000; // 2 seconds between batches
const MAX_ARCHIVED_VIDEOS = 5000;
const API_RESOLVER_DAILY_QUOTA_CAP = 100;
const STARTUP_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const CHANNEL_REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
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

function summarizeFailedChannels(results = []) {
    return results
        .filter(result => result.expected && (!result.channelMetadata && (!result.videos || result.videos.length === 0)))
        .map(result => ({
            id: result.id,
            title: result.title || result.id,
            reason: 'No RSS videos or metadata returned',
        }));
}

function getCurrentPacificDate() {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).format(new Date());
}

function getChannelsDueForRefresh(subscriptions = [], channelRefreshes = {}, options = {}) {
    const now = options.now ?? Date.now();
    const force = Boolean(options.force);

    if (force) return subscriptions;

    return subscriptions.filter(sub => {
        const lastFetchedAt = channelRefreshes[sub.id]?.lastFetchedAt;
        if (!lastFetchedAt) return true;

        const lastFetchedTime = new Date(lastFetchedAt).getTime();
        if (!Number.isFinite(lastFetchedTime)) return true;

        return now - lastFetchedTime >= CHANNEL_REFRESH_INTERVAL_MS;
    });
}

function parseBooleanEnv(value, defaultValue = true) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return !['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function parseRefreshIntervalMs(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) {
        return DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS;
    }

    return Math.round(minutes * 60 * 1000);
}

function getScheduledRefreshConfig(env = process.env) {
    return {
        enabled: parseBooleanEnv(env.FEED_REFRESH_ENABLED, true),
        refreshOnStartup: parseBooleanEnv(env.FEED_REFRESH_ON_START, true),
        intervalMs: parseRefreshIntervalMs(env.FEED_REFRESH_INTERVAL_MINUTES),
    };
}

function mergeChannelRefreshes(existingRefreshes = {}, activeChannelIds = new Set(), fetchedChannels = [], fetchedAt = new Date().toISOString()) {
    const merged = {};

    for (const [channelId, refreshInfo] of Object.entries(existingRefreshes || {})) {
        if (activeChannelIds.has(channelId)) {
            merged[channelId] = refreshInfo;
        }
    }

    for (const channel of fetchedChannels) {
        if (channel?.id && activeChannelIds.has(channel.id)) {
            merged[channel.id] = {
                ...(merged[channel.id] || {}),
                lastFetchedAt: fetchedAt,
            };
        }
    }

    return merged;
}

function getFirstMediaValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function getMediaAttribute(value, attributeName) {
    const entry = getFirstMediaValue(value);
    return entry?.$?.[attributeName] || entry?.[attributeName];
}

function buildVideoFromFeedItem(item, { channelId, channelTitle }) {
    const videoId = item.id?.split(':').pop() || item.guid;
    const mediaGroup = item.mediaGroup || item['media:group'] || {};
    const mediaDescription = getFirstMediaValue(mediaGroup['media:description']);
    const mediaThumbnailUrl = getMediaAttribute(mediaGroup['media:thumbnail'], 'url');
    const durationSeconds = getMediaAttribute(mediaGroup['yt:duration'], 'seconds');
    const duration = durationSeconds ? parseInt(durationSeconds, 10) : null;

    return {
        id: videoId,
        title: item.title,
        channelId: channelId,
        channelTitle,
        publishedAt: item.pubDate || item.isoDate,
        thumbnail: item.media?.thumbnail?.[0]?.url
            || mediaThumbnailUrl
            || item.enclosure?.url
            || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        description: item.contentSnippet || item.content || mediaDescription || '',
        duration: Number.isFinite(duration) ? duration : null,
    };
}

async function fetchChannelFeed(channelId) {
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const feed = await parser.parseURL(feedUrl);

        const videos = feed.items.map((item) => buildVideoFromFeedItem(item, {
            channelId,
            channelTitle: feed.title || item.author || 'Unknown',
        }));

        // Extract channel metadata from feed
        const channelMetadata = {
            title: feed.title || 'Unknown Channel',
            thumbnail: null // Will be fetched separately
        };

        return { videos, channelMetadata };
    } catch (error) {
        console.error(`Failed to fetch feed for ${channelId}:`, error.message);
        return { videos: [], channelMetadata: null };
    }
}

// Fetch real channel thumbnail by scraping the channel page
async function fetchChannelThumbnail(channelId) {
    try {
        const url = `https://www.youtube.com/channel/${channelId}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const html = response.data;

        // Look for channel avatar in meta tags
        const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (avatarMatch) {
            return avatarMatch[1];
        }

        // Alternative: Look for profile image in JSON-LD
        const jsonMatch = html.match(/"avatar":\s*{\s*"thumbnails":\s*\[\s*{\s*"url":\s*"([^"]+)"/);
        if (jsonMatch) {
            return jsonMatch[1].replace(/\\u0026/g, '&');
        }

        return null;
    } catch (error) {
        console.error(`Failed to fetch thumbnail for ${channelId}:`, error.message);
        return null;
    }
}

async function runAggregation(options = {}) {
    console.log('🔄 Starting feed aggregation...');

    try {
        // Read data to get subscriptions and settings
        const parsedData = await readJson(DATA_FILE, DEFAULT_DATA);
        const subscriptions = parsedData.subscriptions || [];
        const existingVideoCache = await readJson(VIDEOS_FILE, { videos: [] });
        const existingVideos = existingVideoCache.videos || [];
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
        let quotaExceeded = false;

        // Apply existing redirects from db.json (even if API is unavailable)
        // This ensures static redirects work even when quota is exhausted
        let hasRedirectUpdates = false;
        const redirectedSubs = [];
        const seenIds = new Set();

        for (const sub of subscriptions) {
            let finalId = sub.id;
            let finalTitle = sub.title;
            let finalThumb = sub.thumbnail;

            // Check if this subscription has a redirect
            if (parsedData.redirects && parsedData.redirects[sub.id]) {
                finalId = parsedData.redirects[sub.id];
                console.log(`🔀 Applying redirect: ${sub.id} -> ${finalId}`);
                hasRedirectUpdates = true;
            }

            // Deduplicate
            if (!seenIds.has(finalId)) {
                seenIds.add(finalId);
                redirectedSubs.push({
                    ...sub,
                    id: finalId,
                    title: finalTitle,
                    thumbnail: finalThumb
                });
            } else {
                console.log(`  (Skipping duplicate: ${finalId})`);
            }
        }

        if (hasRedirectUpdates) {
            parsedData.subscriptions = redirectedSubs;
            await writeJsonQueued(DATA_FILE, parsedData);
            console.log('💾 Updated subscriptions with redirects');
            // Update local reference
            subscriptions.length = 0;
            subscriptions.push(...redirectedSubs);
        }

        // Resolve handles/custom URLs to real IDs with a small automatic API quota cap.
        // Routine video fetching stays RSS-only so a free key is not drained by refreshes.
        if (useResolverApi) {
            let hasUpdates = false;
            const resolvedSubs = [];
            const seenIds = new Set();

            for (const sub of subscriptions) {
                if (sub.id.startsWith('handle_') || sub.id.startsWith('custom_')) {
                    try {
                        if (resolverQuotaUsed >= API_RESOLVER_DAILY_QUOTA_CAP) {
                            console.warn('⚠️ API resolver quota cap reached. Remaining unresolved channels will use RSS/public fallbacks.');
                            resolvedSubs.push(sub);
                            seenIds.add(sub.id);
                            continue;
                        }

                        let resolveUrl;
                        let param;
                        if (sub.id.startsWith('handle_')) {
                            param = sub.id.replace('handle_', '');
                            // Handles must include @
                            if (!param.startsWith('@')) param = '@' + param;
                            resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(param)}&key=${apiKey}`;
                        } else {
                            param = sub.id.replace('custom_', '');
                            resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${encodeURIComponent(param)}&key=${apiKey}`;
                        }

                        const res = await axios.get(resolveUrl);
                        resolverQuotaUsed += 1;
                        if (!parsedData.settings) parsedData.settings = {};
                        parsedData.settings.quotaUsed = resolverQuotaUsed;

                        if (res.data.items?.[0]) {
                            const realId = res.data.items[0].id;
                            const realTitle = res.data.items[0].snippet.title;
                            const realThumb = res.data.items[0].snippet.thumbnails.high?.url;

                            console.log(`✨ Resolved ${sub.id} -> ${realId} (${realTitle})`);

                            // Save redirect so clients can update too
                            if (!parsedData.redirects) parsedData.redirects = {};
                            parsedData.redirects[sub.id] = realId;

                            // Check if we already have this ID (either in original list or resolved list)
                            // We need to check against the *future* list we are building
                            if (!seenIds.has(realId)) {
                                resolvedSubs.push({
                                    ...sub,
                                    id: realId,
                                    title: realTitle || sub.title,
                                    thumbnail: realThumb || sub.thumbnail
                                });
                                seenIds.add(realId);
                            } else {
                                console.log(`  (Merged with existing subscription)`);
                            }
                            hasUpdates = true;
                            continue;
                        }
                    } catch (err) {
                        console.error(`Failed to resolve handle ${sub.id}:`, err.message);
                    }
                }

                // Keep existing valid sub if not duplicate
                if (!seenIds.has(sub.id)) {
                    resolvedSubs.push(sub);
                    seenIds.add(sub.id);
                }
            }

            if (hasUpdates) {
                parsedData.subscriptions = resolvedSubs;
                await writeJsonQueued(DATA_FILE, parsedData);
                console.log('💾 Updated subscriptions with resolved IDs');
                // Update local reference
                subscriptions.length = 0;
                subscriptions.push(...resolvedSubs);
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
                        const { videos, channelMetadata } = await fetchChannelFeed(sub.id);
                        failedChannels.push(...summarizeFailedChannels([{ ...sub, expected: true, videos, channelMetadata }]));
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
                    const { videos, channelMetadata } = await fetchChannelFeed(sub.id);
                    failedChannels.push(...summarizeFailedChannels([{ ...sub, expected: true, videos, channelMetadata }]));
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
                    const { videos, channelMetadata } = await fetchChannelFeed(sub.id);
                    failedChannels.push(...summarizeFailedChannels([{ ...sub, expected: true, videos, channelMetadata }]));

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

            allVideos.push(...batchVideos);

            const currentVideos = mergeVideoArchive(existingVideos, allVideos, {
                activeChannelIds: new Set(subscriptions.map(sub => sub.id)),
                maxVideos: MAX_ARCHIVED_VIDEOS,
            });
            channelRefreshes = mergeChannelRefreshes(
                channelRefreshes,
                new Set(subscriptions.map(sub => sub.id)),
                batch,
                new Date().toISOString()
            );

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
                channelRefreshes
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
            videos: archivedVideos,
            lastUpdated: new Date().toISOString(),
            totalChannels: subscriptions.length,
            totalVideos: archivedVideos.length,
            channelRefreshes: mergeChannelRefreshes(
                channelRefreshes,
                new Set(subscriptions.map(sub => sub.id)),
                subscriptionsToRefresh,
                new Date().toISOString()
            )
        });

        aggregationStatus = {
            state: 'idle',
            current: subscriptions.length,
            total: subscriptions.length,
            videos: archivedVideos.length,
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

        console.log(`✅ Aggregation complete: ${archivedVideos.length} archived videos from ${subscriptions.length} channels`);
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

        if (cacheMatchesSubscriptions && cacheHasVideos && cacheAge < STARTUP_CACHE_MAX_AGE_MS) {
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
    buildVideoFromFeedItem
};
