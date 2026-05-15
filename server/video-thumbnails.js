const SHORTS_TEXT_PATTERN = /#shorts?\b|\bshorts\b|youtube\.com\/shorts\//i;
const YOUTUBE_VIDEO_THUMBNAIL_PATTERN = /\/(?:vi|vi_webp)\/([^/]+)\/(?:maxresdefault|hq720|sddefault|hqdefault|mqdefault|default|oar2|maxres2|hq2|frame0|0|1|2|3)\.(jpg|webp)(\?.*)?$/i;

function isShortVideo(video = {}) {
    if (typeof video.isShort === 'boolean') return video.isShort;
    return SHORTS_TEXT_PATTERN.test(`${video.title || ''} ${video.description || ''}`);
}

function getHighResolutionVideoThumbnail(thumbnail, videoId, options = {}) {
    const fallback = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : '';
    const source = String(thumbnail || fallback);
    const preferredThumbnailName = options.isShort ? 'oar2' : 'maxresdefault';

    try {
        const url = new URL(source);
        if ((url.hostname === 'i.ytimg.com' || url.hostname === 'img.youtube.com') && YOUTUBE_VIDEO_THUMBNAIL_PATTERN.test(url.pathname)) {
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
    return {
        ...video,
        isShort,
        thumbnail: getHighResolutionVideoThumbnail(video.thumbnail, video.id, { isShort }),
    };
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
