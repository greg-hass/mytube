const axios = require('axios');

const SHORTS_STATUS_CONCURRENCY = 8;
const ARCHIVED_SHORTS_STATUS_BACKFILL_LIMIT = 5000;
const SHORTS_TEXT_PATTERN = /#shorts?\b|#ytshorts?\b|#fyp\b|\bshorts\b|youtube\.com\/shorts\//i;
const SHORTS_THUMBNAIL_PATTERN = /\/(?:oar2|maxres2|hq2|frame0)\.(?:jpg|webp)(?:\?|$)/i;

function looksLikeShortByLocalMetadata(video = {}) {
    const text = `${video.title || ''} ${video.description || ''}`;
    if (SHORTS_TEXT_PATTERN.test(text)) return true;
    if (SHORTS_THUMBNAIL_PATTERN.test(video.thumbnail || '')) return true;
    return Number.isFinite(video.duration) && video.duration > 0 && video.duration <= 60;
}

function getResponseUrl(response = {}) {
    return response.url
        || response.responseUrl
        || response.request?.responseURL
        || response.request?.res?.responseUrl
        || response.headers?.location
        || '';
}

function applyLocalShortsMetadata(videos = [], shortsStatusById = {}) {
    for (const video of videos) {
        if (!video?.id) continue;

        if (looksLikeShortByLocalMetadata(video)) {
            shortsStatusById[video.id] = true;
            video.isShort = true;
        } else if (typeof shortsStatusById[video.id] === 'boolean') {
            video.isShort = shortsStatusById[video.id];
        }
    }

    return shortsStatusById;
}

async function resolveYouTubeShortsStatus(videoId, httpClient = axios) {
    if (!videoId) return undefined;

    try {
        const response = await httpClient.get(`https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            maxRedirects: 5,
            timeout: 3000,
            validateStatus: () => true,
        });

        const responseUrl = getResponseUrl(response);
        if (responseUrl) {
            return responseUrl.includes(`/shorts/${videoId}`);
        }

        if (response.status === 200) return true;
        if (response.status >= 300 && response.status < 400) return false;

        return undefined;
    } catch (error) {
        return undefined;
    }
}

async function enrichVideosWithShortsStatus(videos = [], shortsStatusById = {}, httpClient = axios) {
    applyLocalShortsMetadata(videos, shortsStatusById);
    const queue = videos.filter((video) => video?.id && typeof shortsStatusById[video.id] !== 'boolean');
    let cursor = 0;

    const workers = Array.from({ length: Math.min(SHORTS_STATUS_CONCURRENCY, queue.length) }, async () => {
        while (cursor < queue.length) {
            const video = queue[cursor];
            cursor += 1;
            const status = await resolveYouTubeShortsStatus(video.id, httpClient);
            if (typeof status === 'boolean') {
                shortsStatusById[video.id] = status;
            }
        }
    });

    await Promise.all(workers);

    for (const video of videos) {
        if (video?.id && typeof shortsStatusById[video.id] === 'boolean') {
            video.isShort = shortsStatusById[video.id];
        }
    }

    return shortsStatusById;
}

async function backfillArchivedShortsStatus(existingVideos = [], shortsStatusById = {}, httpClient = axios) {
    const candidates = existingVideos
        .filter((video) => video?.id && typeof shortsStatusById[video.id] !== 'boolean')
        .slice(0, ARCHIVED_SHORTS_STATUS_BACKFILL_LIMIT);

    if (candidates.length === 0) return shortsStatusById;

    console.log(`🩳 Backfilling Shorts status for ${candidates.length} archived videos`);
    return enrichVideosWithShortsStatus(candidates, shortsStatusById, httpClient);
}

function startArchivedShortsStatusBackfill(existingVideos = [], shortsStatusById = {}, options = {}) {
    const {
        httpClient = axios,
        onComplete = async () => {},
        onError = (error) => console.error('Archived Shorts metadata backfill failed:', error),
    } = options;

    return Promise.resolve()
        .then(() => backfillArchivedShortsStatus(existingVideos, shortsStatusById, httpClient))
        .then(() => onComplete(shortsStatusById))
        .catch((error) => {
            onError(error);
        });
}

module.exports = {
    applyLocalShortsMetadata,
    backfillArchivedShortsStatus,
    enrichVideosWithShortsStatus,
    looksLikeShortByLocalMetadata,
    resolveYouTubeShortsStatus,
    startArchivedShortsStatusBackfill,
};
