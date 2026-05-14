const CHANNEL_REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function summarizeFailedChannels(results = []) {
    return results
        .filter(result => result.expected && (!result.channelMetadata && (!result.videos || result.videos.length === 0)))
        .map(result => ({
            id: result.id,
            title: result.title || result.id,
            reason: result.errorStatus
                ? `RSS feed failed with HTTP ${result.errorStatus}`
                : result.errorMessage || 'No RSS videos or metadata returned',
        }));
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

module.exports = {
    CHANNEL_REFRESH_INTERVAL_MS,
    DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
    getChannelsDueForRefresh,
    getScheduledRefreshConfig,
    mergeChannelRefreshes,
    summarizeFailedChannels,
};
