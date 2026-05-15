const Parser = require('rss-parser');
const axios = require('axios');
const { getHighResolutionVideoThumbnail } = require('./video-thumbnails');

const FEED_FETCH_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const FEED_FETCH_MAX_ATTEMPTS = 3;
const UPLOADS_PLAYLIST_FETCH_LIMIT = 15;

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

function parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getHttpStatusFromError(error) {
    if (Number.isInteger(error?.statusCode)) return error.statusCode;
    if (Number.isInteger(error?.status)) return error.status;
    if (Number.isInteger(error?.response?.status)) return error.response.status;

    const match = String(error?.message || '').match(/\bstatus code\s+(\d{3})\b/i);
    return match ? Number(match[1]) : null;
}

function getFirstMediaValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function getMediaAttribute(value, attributeName) {
    const entry = getFirstMediaValue(value);
    return entry?.$?.[attributeName] || entry?.[attributeName];
}

function getTextValue(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) {
        return value.runs.map(run => run.text || '').join('');
    }
    return '';
}

function getBestThumbnailUrl(thumbnails = []) {
    if (!Array.isArray(thumbnails) || thumbnails.length === 0) return '';
    const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
    const url = sorted[0]?.url || '';
    if (url.startsWith('//')) return `https:${url}`;
    return url.replace(/\\u0026/g, '&');
}

function parseRelativePublishedAt(text, now = Date.now()) {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'yesterday') return new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const match = normalized.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
    if (!match) return null;

    const amount = Number(match[1]);
    const multipliers = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
    };

    return new Date(now - amount * multipliers[match[2]]).toISOString();
}

function extractBalancedJson(source, startIndex) {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < source.length; i += 1) {
        const char = source[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(startIndex, i + 1);
            }
        }
    }

    return null;
}

function parseYtInitialData(html) {
    const source = String(html || '');
    const markerIndex = source.indexOf('ytInitialData');
    if (markerIndex === -1) return null;

    const objectStart = source.indexOf('{', markerIndex);
    if (objectStart === -1) return null;

    const json = extractBalancedJson(source, objectStart);
    if (!json) return null;

    try {
        return JSON.parse(json);
    } catch (error) {
        return null;
    }
}

function walkYouTubeRenderers(value, visitor) {
    if (!value || typeof value !== 'object') return;
    visitor(value);

    if (Array.isArray(value)) {
        value.forEach(item => walkYouTubeRenderers(item, visitor));
        return;
    }

    Object.values(value).forEach(item => walkYouTubeRenderers(item, visitor));
}

function parseUploadsPlaylistVideos(html, { channelId, now = Date.now() } = {}) {
    const initialData = parseYtInitialData(html);
    if (!initialData) return { videos: [], title: null };

    const playlistTitle = getTextValue(initialData.metadata?.playlistMetadataRenderer?.title)
        .replace(/\s+-\s+Videos$/i, '')
        .trim();
    const videos = [];
    const seenVideoIds = new Set();

    walkYouTubeRenderers(initialData, (node) => {
        const renderer = node.playlistVideoRenderer || node.gridVideoRenderer || node.videoRenderer;
        if (!renderer?.videoId || seenVideoIds.has(renderer.videoId)) return;

        seenVideoIds.add(renderer.videoId);
        const title = getTextValue(renderer.title) || 'Untitled';
        const publishedText = getTextValue(renderer.publishedTimeText);
        const publishedAt = parseRelativePublishedAt(publishedText, now);
        if (!publishedAt) return;

        const thumbnail = getHighResolutionVideoThumbnail(getBestThumbnailUrl(renderer.thumbnail?.thumbnails), renderer.videoId);

        videos.push({
            id: renderer.videoId,
            title,
            channelId,
            channelTitle: playlistTitle || 'Unknown',
            publishedAt,
            thumbnail,
            description: '',
            duration: null,
            fetchedVia: 'youtube-page-fallback',
            publishedAtSource: 'youtube-relative-time',
        });
    });

    return { videos: videos.slice(0, UPLOADS_PLAYLIST_FETCH_LIMIT), title: playlistTitle || null };
}

function buildVideoFromFeedItem(item, { channelId, channelTitle }) {
    const videoId = item.id?.split(':').pop() || item.guid;
    const mediaGroup = item.mediaGroup || item['media:group'] || {};
    const mediaDescription = getFirstMediaValue(mediaGroup['media:description']);
    const mediaThumbnailUrl = getMediaAttribute(mediaGroup['media:thumbnail'], 'url');
    const durationSeconds = getMediaAttribute(mediaGroup['yt:duration'], 'seconds');
    const duration = durationSeconds ? parseInt(durationSeconds, 10) : null;
    const looksLikeShort = /#shorts?\b|\bshorts\b|youtube\.com\/shorts\//i.test(`${item.title || ''} ${mediaDescription || ''}`);

    const video = {
        id: videoId,
        title: item.title,
        channelId: channelId,
        channelTitle,
        publishedAt: item.pubDate || item.isoDate,
        thumbnail: getHighResolutionVideoThumbnail(
            item.media?.thumbnail?.[0]?.url
            || mediaThumbnailUrl
            || item.enclosure?.url,
            videoId,
            { isShort: looksLikeShort }
        ),
        description: item.contentSnippet || item.content || mediaDescription || '',
        duration: Number.isFinite(duration) ? duration : null,
    };

    if (looksLikeShort) {
        video.isShort = true;
    }

    return video;
}

async function fetchUploadsPlaylistFeed(channelId, httpClient = axios, options = {}) {
    if (!channelId?.startsWith('UC')) {
        return { videos: [], channelMetadata: null };
    }

    const uploadsPlaylistId = `UU${channelId.slice(2)}`;
    const url = `https://www.youtube.com/playlist?list=${uploadsPlaylistId}`;
    const response = await httpClient.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: options.timeout || 10000,
    });

    const { videos, title } = parseUploadsPlaylistVideos(response.data, {
        channelId,
        now: options.now,
    });

    if (title) {
        videos.forEach((video) => {
            video.channelTitle = title;
        });
    }

    return {
        videos,
        channelMetadata: title ? { title, thumbnail: null } : null,
    };
}

async function fetchChannelFeed(channelId, feedParser = parser, options = {}) {
    const maxAttempts = options.maxAttempts || FEED_FETCH_MAX_ATTEMPTS;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            const feed = await feedParser.parseURL(feedUrl);

            const videos = feed.items.map((item) => buildVideoFromFeedItem(item, {
                channelId,
                channelTitle: feed.title || item.author || 'Unknown',
            }));

            return {
                videos,
                channelMetadata: {
                    title: feed.title || 'Unknown Channel',
                    thumbnail: null
                },
            };
        } catch (error) {
            lastError = error;
            const status = getHttpStatusFromError(error);
            const shouldRetry = FEED_FETCH_RETRY_STATUSES.has(status) && attempt < maxAttempts;

            if (!shouldRetry) {
                const shouldUseFallback = options.fallbackToUploadsPage !== false;
                if (shouldUseFallback) {
                    try {
                        const fallbackResult = await fetchUploadsPlaylistFeed(channelId, options.httpClient || axios, {
                            now: options.now,
                        });

                        if (fallbackResult.videos.length > 0) {
                            console.warn(`RSS failed for ${channelId}; used uploads playlist fallback.`);
                            return {
                                ...fallbackResult,
                                usedFallback: true,
                                originalErrorStatus: status,
                                originalErrorMessage: error.message,
                            };
                        }
                    } catch (fallbackError) {
                        console.warn(`Uploads playlist fallback failed for ${channelId}:`, fallbackError.message);
                    }
                }

                console.error(`Failed to fetch feed for ${channelId}:`, error.message);
                return {
                    videos: [],
                    channelMetadata: null,
                    errorStatus: status,
                    errorMessage: error.message,
                    transient: FEED_FETCH_RETRY_STATUSES.has(status),
                };
            }

            console.warn(`Retrying feed for ${channelId} after HTTP ${status} (${attempt}/${maxAttempts})`);
            await sleep(options.retryDelayMs ?? attempt * 750);
        }
    }

    return {
        videos: [],
        channelMetadata: null,
        errorStatus: getHttpStatusFromError(lastError),
        errorMessage: lastError?.message || 'Failed to fetch feed',
        transient: true,
    };
}

async function fetchChannelThumbnail(channelId) {
    try {
        const url = `https://www.youtube.com/channel/${channelId}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const html = response.data;
        const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (avatarMatch) {
            return avatarMatch[1];
        }

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

module.exports = {
    buildVideoFromFeedItem,
    fetchChannelFeed,
    fetchChannelThumbnail,
    fetchUploadsPlaylistFeed,
    parseDuration,
    parseUploadsPlaylistVideos,
};
