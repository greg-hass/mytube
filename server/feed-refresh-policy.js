const CHANNEL_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CHANNEL_FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000;
const CHANNEL_FAILURE_BACKOFF_THRESHOLD = 3;

function getFailureReason(result) {
    return result.errorStatus
        ? `RSS feed failed with HTTP ${result.errorStatus}`
        : result.errorMessage || 'No RSS videos or metadata returned';
}

function isFailedRefreshResult(result) {
    if (result.outcome) {
        return result.outcome === 'transient-failure' || result.outcome === 'permanent-failure';
    }
    return result.expected && (!result.channelMetadata && (!result.videos || result.videos.length === 0));
}

function summarizeFailedChannels(results = [], channelRefreshes = {}) {
    return results
        .filter(isFailedRefreshResult)
        .map(result => {
            const refreshInfo = channelRefreshes[result.id] || {};
            return {
                id: result.id,
                title: result.title || result.id,
                reason: refreshInfo.lastError || getFailureReason(result),
                lastSuccessfulFetchAt: refreshInfo.lastSuccessfulFetchAt,
                lastFailedFetchAt: refreshInfo.lastFailedFetchAt,
                consecutiveFailures: refreshInfo.consecutiveFailures,
                backoffUntil: refreshInfo.backoffUntil,
            };
        });
}

function getChannelsDueForRefresh(subscriptions = [], channelRefreshes = {}, options = {}) {
    const now = options.now ?? Date.now();
    const force = Boolean(options.force);

    if (force) return subscriptions;

    return subscriptions.filter(sub => {
        const refreshInfo = channelRefreshes[sub.id];
        const backoffUntil = refreshInfo?.backoffUntil;

        if (backoffUntil) {
            const backoffTime = new Date(backoffUntil).getTime();
            if (Number.isFinite(backoffTime) && now < backoffTime) return false;
        }

        const lastFetchedAt = refreshInfo?.lastFetchedAt;
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

function getNextChannelsForRefresh(subscriptions = [], channelRefreshes = {}, { limit = 5 } = {}) {
    const sorted = [...subscriptions].sort((a, b) => {
        const aLast = new Date(channelRefreshes[a.id]?.lastSuccessfulFetchAt || 0).getTime();
        const bLast = new Date(channelRefreshes[b.id]?.lastSuccessfulFetchAt || 0).getTime();
        return aLast - bLast;
    });
    return sorted.slice(0, Math.max(0, limit)).map((sub) => ({
        id: sub.id,
        title: sub.title,
        thumbnail: sub.thumbnail,
        lastSuccessfulFetchAt: channelRefreshes[sub.id]?.lastSuccessfulFetchAt || null,
        consecutiveFailures: channelRefreshes[sub.id]?.consecutiveFailures || 0,
    }));
}

function mergeChannelRefreshes(existingRefreshes = {}, activeChannelIds = new Set(), fetchedChannels = [], fetchedAt = new Date().toISOString()) {
    const merged = {};
    const fetchedTime = new Date(fetchedAt).getTime();

    for (const [channelId, refreshInfo] of Object.entries(existingRefreshes || {})) {
        if (activeChannelIds.has(channelId)) {
            merged[channelId] = refreshInfo;
        }
    }

    for (const channel of fetchedChannels) {
        if (channel?.id && activeChannelIds.has(channel.id)) {
            const previous = merged[channel.id] || {};
            const failed = isFailedRefreshResult(channel);
            const source = channel.source || 'rss';

            if (failed) {
                const consecutiveFailures = (previous.consecutiveFailures || 0) + 1;
                const shouldBackoff = consecutiveFailures >= CHANNEL_FAILURE_BACKOFF_THRESHOLD && Number.isFinite(fetchedTime);

                merged[channel.id] = {
                    ...previous,
                    lastAttemptedAt: fetchedAt,
                    lastFetchedAt: fetchedAt,
                    lastFailedFetchAt: fetchedAt,
                    outcome: channel.outcome || (channel.transient ? 'transient-failure' : 'permanent-failure'),
                    itemHash: channel.itemHash || previous.itemHash || null,
                    lastError: getFailureReason(channel),
                    consecutiveFailures,
                    backoffUntil: shouldBackoff
                        ? new Date(fetchedTime + CHANNEL_FAILURE_BACKOFF_MS).toISOString()
                        : previous.backoffUntil || null,
                    source,
                };
                continue;
            }

            merged[channel.id] = {
                ...previous,
                lastAttemptedAt: fetchedAt,
                lastFetchedAt: fetchedAt,
                lastSuccessfulFetchAt: fetchedAt,
                outcome: channel.outcome || 'success',
                itemHash: channel.itemHash || previous.itemHash || null,
                consecutiveFailures: 0,
                backoffUntil: null,
                lastError: null,
                source,
            };
        }
    }

    return merged;
}

module.exports = {
    CHANNEL_REFRESH_INTERVAL_MS,
    CHANNEL_FAILURE_BACKOFF_MS,
    CHANNEL_FAILURE_BACKOFF_THRESHOLD,
    DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
    getChannelsDueForRefresh,
    getNextChannelsForRefresh,
    getScheduledRefreshConfig,
    mergeChannelRefreshes,
    summarizeFailedChannels,
};
