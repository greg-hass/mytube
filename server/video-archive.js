function getVideoTime(video) {
    const time = new Date(video?.publishedAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function isLikelyFallbackNowStamp(video, cacheUpdatedAt) {
    if (video?.fetchedVia !== 'youtube-page-fallback') return false;
    if (video.publishedAtSource) return false;

    const publishedTime = getVideoTime(video);
    const cacheUpdatedTime = new Date(cacheUpdatedAt || 0).getTime();
    if (!publishedTime || !Number.isFinite(cacheUpdatedTime)) return false;

    return Math.abs(cacheUpdatedTime - publishedTime) <= 30 * 1000;
}

function mergeVideoArchive(existingVideos = [], fetchedVideos = [], options = {}) {
    const maxVideos = options.maxVideos || 5000;
    const activeChannelIds = options.activeChannelIds || null;
    const cacheUpdatedAt = options.cacheUpdatedAt || null;
    const byId = new Map();

    for (const video of existingVideos) {
        if (!video?.id) continue;
        if (activeChannelIds && !activeChannelIds.has(video.channelId)) continue;
        if (isLikelyFallbackNowStamp(video, cacheUpdatedAt)) continue;
        byId.set(video.id, video);
    }

    for (const video of fetchedVideos) {
        if (!video?.id) continue;
        if (activeChannelIds && !activeChannelIds.has(video.channelId)) continue;
        if (video.fetchedVia === 'youtube-page-fallback' && byId.has(video.id)) {
            const existing = byId.get(video.id);
            byId.set(video.id, {
                ...existing,
                ...video,
                publishedAt: existing.publishedAt || video.publishedAt,
                description: existing.description || video.description,
                duration: existing.duration ?? video.duration,
                isShort: existing.isShort ?? video.isShort,
            });
            continue;
        }
        byId.set(video.id, video);
    }

    return Array.from(byId.values())
        .sort((a, b) => getVideoTime(b) - getVideoTime(a))
        .slice(0, maxVideos);
}

module.exports = { mergeVideoArchive };
