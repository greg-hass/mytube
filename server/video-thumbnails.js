const SHORTS_TEXT_PATTERN = /#shorts?\b|#ytshorts?\b|#fyp\b|\bshorts\b|youtube\.com\/shorts\//i;
const SHORTS_THUMBNAIL_PATTERN = /\/(?:oar2|maxres2|hq2|frame0)\.(?:jpg|webp)(?:\?|$)/i;
const YOUTUBE_VIDEO_THUMBNAIL_PATTERN = /\/(?:vi|vi_webp)\/([^/]+)\/(?:maxresdefault|hq720|sddefault|hqdefault|mqdefault|default|oar2|maxres2|hq2|frame0|0|1|2|3)\.(jpg|webp)(\?.*)?$/i;

function isShortVideo(video = {}) {
    if (video.isShort === true) return true;
    if (SHORTS_THUMBNAIL_PATTERN.test(video.thumbnail || '')) return true;
    return SHORTS_TEXT_PATTERN.test(`${video.title || ''} ${video.description || ''}`);
}

function getHighResolutionVideoThumbnail(thumbnail, videoId, options = {}) {
    const fallback = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
    const source = String(thumbnail || fallback);
    const preferredThumbnailName = options.isShort ? 'oar2' : 'hqdefault';

    try {
        const url = new URL(source);
        if ((/^i\d*\.ytimg\.com$/i.test(url.hostname) || url.hostname === 'img.youtube.com') && YOUTUBE_VIDEO_THUMBNAIL_PATTERN.test(url.pathname)) {
            url.pathname = url.pathname.replace(YOUTUBE_VIDEO_THUMBNAIL_PATTERN, `/vi/$1/${preferredThumbnailName}.$2`);
            return url.toString();
        }
    } catch {
        // Fall through to the original value or fallback URL.
    }

    return source || fallback;
}

function normalizeVideoThumbnail(video) {
    if (!video?.id) return video;

    const isShort = isShortVideo(video);
    const normalized = {
        ...video,
        thumbnail: getHighResolutionVideoThumbnail(video.thumbnail, video.id, { isShort }),
    };

    if (isShort) {
        normalized.isShort = true;
    } else {
        delete normalized.isShort;
    }

    return normalized;
}

function normalizeVideoCacheThumbnails(cache = {}) {
    if (!Array.isArray(cache.videos)) return cache;

    return {
        ...cache,
        videos: cache.videos.map(normalizeVideoThumbnail),
    };
}

module.exports = {
    getHighResolutionVideoThumbnail,
    isShortVideo,
    normalizeVideoCacheThumbnails,
    normalizeVideoThumbnail,
};
