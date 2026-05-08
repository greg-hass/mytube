function getVideoTime(video) {
    const time = new Date(video?.publishedAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function mergeVideoArchive(existingVideos = [], fetchedVideos = [], options = {}) {
    const maxVideos = options.maxVideos || 5000;
    const activeChannelIds = options.activeChannelIds || null;
    const byId = new Map();

    for (const video of existingVideos) {
        if (!video?.id) continue;
        if (activeChannelIds && !activeChannelIds.has(video.channelId)) continue;
        byId.set(video.id, video);
    }

    for (const video of fetchedVideos) {
        if (!video?.id) continue;
        if (activeChannelIds && !activeChannelIds.has(video.channelId)) continue;
        byId.set(video.id, video);
    }

    return Array.from(byId.values())
        .sort((a, b) => getVideoTime(b) - getVideoTime(a))
        .slice(0, maxVideos);
}

module.exports = { mergeVideoArchive };
