const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { recoverDataFiles } = require('./data-integrity');
const { mergeIncomingSubscriptions, removeSensitiveSyncSettings } = require('./subscription-merge');
const { searchChannels } = require('./channel-search');
const { normalizeVideoCacheThumbnails } = require('./video-thumbnails');
const appStore = require('./app-store');
const {
    createApiKeyAuthMiddleware,
    createBucketRateLimiter,
    createCorsOptions,
    createOriginGuardMiddleware,
    createRateLimitMiddleware,
    parseAllowedOrigins,
    validateSyncPayload,
} = require('./security-middleware');
const serverPackage = require('./package.json');

let feedAggregator = null;

function readPackageMetadata(packagePath, fallback) {
    try {
        return require(packagePath);
    } catch (error) {
        if (error && error.code === 'MODULE_NOT_FOUND') {
            return fallback;
        }
        throw error;
    }
}

const appPackage = readPackageMetadata('../package.json', { version: 'unknown' });

function asyncHandler(handler, errorMessage) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (err) {
            console.error(`${errorMessage}:`, err.message || err);
            res.status(500).json({ error: errorMessage });
        }
    };
}

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = appStore.DEFAULT_DATA_FILE;
const VIDEOS_FILE = appStore.DEFAULT_VIDEOS_FILE;
const DEFAULT_DATA = appStore.DEFAULT_DATA;
const DEFAULT_VIDEO_CACHE = appStore.DEFAULT_VIDEO_CACHE;
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const API_WRITE_RATE_LIMIT_WINDOW_MS = Number(process.env.API_WRITE_RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const API_WRITE_RATE_LIMIT_MAX = Number(process.env.API_WRITE_RATE_LIMIT_MAX) || 30;
const ALLOW_INSECURE_UNAUTHENTICATED_API = process.env.ALLOW_INSECURE_UNAUTHENTICATED_API === 'true';

// --- Thumbnail proxy hardening ---
const THUMBNAIL_PROXY_TIMEOUT_MS = 5000;
const THUMBNAIL_PROXY_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const THUMBNAIL_PROXY_RATE_WINDOW_MS = 60 * 1000;
const THUMBNAIL_PROXY_RATE_MAX = 60;
const thumbnailRateLimiter = createBucketRateLimiter({
    windowMs: THUMBNAIL_PROXY_RATE_WINDOW_MS,
    max: THUMBNAIL_PROXY_RATE_MAX,
});
// --- End thumbnail proxy hardening ---

let dataIntegrityEvents = [];
let server = null;
let shutdownPromise = null;

app.use(cors(createCorsOptions({ allowedOrigins: ALLOWED_ORIGINS })));
app.use(createOriginGuardMiddleware({ allowedOrigins: ALLOWED_ORIGINS }));
app.use('/api', createApiKeyAuthMiddleware({
    token: process.env.SERVER_API_TOKEN,
    allowInsecureUnauthenticatedApi: ALLOW_INSECURE_UNAUTHENTICATED_API,
}));
app.use('/api', createRateLimitMiddleware({
    windowMs: API_WRITE_RATE_LIMIT_WINDOW_MS,
    max: API_WRITE_RATE_LIMIT_MAX,
}));
app.use(express.json({ limit: '5mb' }));

// Deliberately minimal health probe for container/reverse-proxy checks.
app.get('/api/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

// Ensure data directory exists
async function init() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        dataIntegrityEvents = await recoverDataFiles([
            { file: DATA_FILE, fallback: DEFAULT_DATA },
            { file: VIDEOS_FILE, fallback: DEFAULT_VIDEO_CACHE },
        ]);

        await appStore.init();
        let data = await appStore.readData(DEFAULT_DATA);

        // Merge static redirects from redirects.json if it exists
        try {
            const staticRedirectsFile = path.join(__dirname, 'redirects.json');
            const staticRedirectsContent = await fs.readFile(staticRedirectsFile, 'utf8');
            const staticRedirects = JSON.parse(staticRedirectsContent);

            data.redirects = { ...data.redirects, ...staticRedirects };
            console.log('✅ Merged static redirects:', Object.keys(staticRedirects));

            await appStore.writeData(data);
        } catch (err) {
            // No static redirects or error reading, ignore
        }

    } catch (err) {
        console.error('Failed to initialize data storage:', err);
        throw err;
    }
}

// GET /api/health - Lightweight service and data health summary
app.get('/api/health', async (req, res) => {
    try {
        const [data, videoCache] = await Promise.all([
            appStore.readData(DEFAULT_DATA),
            appStore.readVideoCache(DEFAULT_VIDEO_CACHE)
        ]);

        res.json({
            status: 'ok',
            subscriptions: data.subscriptions?.length || 0,
            watchedVideos: data.watchedVideos?.length || 0,
            videos: videoCache.totalVideos || videoCache.videos?.length || 0,
            lastUpdated: videoCache.lastUpdated || null,
            uptime: process.uptime(),
            dataIntegrity: dataIntegrityEvents,
        });
    } catch (err) {
        console.error('Health check error:', err);
        res.status(500).json({ status: 'error', error: 'Health check failed' });
    }
});

// GET /api/version - App and server version metadata
app.get('/api/version', (req, res) => {
    res.json({
        name: serverPackage.name,
        version: serverPackage.version,
        appVersion: appPackage.version,
        node: process.version,
        buildDate: process.env.BUILD_DATE || null,
    });
});

// GET /api/sync - Retrieve all data
app.get('/api/sync', asyncHandler(async (req, res) => {
    const data = await appStore.readData(DEFAULT_DATA);
    res.json(removeSensitiveSyncSettings(data));
}, 'Failed to read data'));

// GET /api/channel-thumbnail - Same-origin proxy for YouTube channel thumbnails.
// Some browsers/extensions intermittently block direct yt3.googleusercontent.com
// image loads; proxying through localhost makes channel icons deterministic.
//
// Hardened: per-IP rate limiting, upstream timeout, response-size cap.
app.get('/api/channel-thumbnail', async (req, res) => {
    try {
        // --- Rate limiting ---
        const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
        if (!thumbnailRateLimiter.checkLimit(clientIp)) {
            return res.status(429).json({ error: 'Too many thumbnail requests' });
        }

        const rawUrl = req.query.url;
        if (!rawUrl || typeof rawUrl !== 'string') {
            return res.status(400).json({ error: 'Missing thumbnail URL' });
        }

        let thumbnailUrl;
        try {
            thumbnailUrl = new URL(rawUrl);
        } catch {
            return res.status(400).json({ error: 'Invalid thumbnail URL' });
        }

        const allowedHosts = new Set([
            'yt3.googleusercontent.com',
            'yt3.ggpht.com',
            'i.ytimg.com',
        ]);

        if (thumbnailUrl.protocol !== 'https:' || !allowedHosts.has(thumbnailUrl.hostname)) {
            return res.status(400).json({ error: 'Unsupported thumbnail host' });
        }

        // --- Upstream fetch with timeout ---
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), THUMBNAIL_PROXY_TIMEOUT_MS);

        let response;
        try {
            response = await fetch(thumbnailUrl.toString(), {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                },
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch thumbnail' });
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return res.status(502).json({ error: 'Thumbnail response was not an image' });
        }

        // --- Response size cap ---
        const contentLength = response.headers.get('content-length');
        if (contentLength && Number(contentLength) > THUMBNAIL_PROXY_MAX_BYTES) {
            return res.status(502).json({ error: 'Thumbnail exceeds size limit' });
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer());
        if (imageBuffer.length > THUMBNAIL_PROXY_MAX_BYTES) {
            return res.status(502).json({ error: 'Thumbnail exceeds size limit' });
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.send(imageBuffer);
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'Upstream thumbnail request timed out' });
        }
        console.error('Channel thumbnail proxy error:', err);
        res.status(500).json({ error: 'Failed to proxy thumbnail' });
    }
});

// GET /api/channel-search?q=... - Keyword/fuzzy channel discovery without YouTube Data API.
app.get('/api/channel-search', asyncHandler(async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
        return res.json({ results: [] });
    }

    const results = await searchChannels(query, { limit: 8 });
    res.json({ results });
}, 'Failed to search channels'));

// POST /api/sync - Overwrite all data (simple sync)
app.post('/api/sync', asyncHandler(async (req, res) => {
    const data = removeSensitiveSyncSettings(req.body);

    const validation = validateSyncPayload(data);
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }

    // Add timestamp
    data.lastSyncedAt = new Date().toISOString();

    const savedData = await appStore.updateData(DEFAULT_DATA, (existingData) => {
        const redirects = existingData.redirects || {};

        if (data.subscriptions) {
            Object.keys(redirects).forEach((sourceId) => {
                if (data.subscriptions.some(sub => sub.id === sourceId)) {
                    console.log(`🔀 Server applying redirect on sync: ${sourceId} -> ${redirects[sourceId]}`);
                }
            });
            data.subscriptions = mergeIncomingSubscriptions(
                data.subscriptions,
                existingData.subscriptions || [],
                redirects
            );
        }

        // ALWAYS preserve redirects from server, never let client overwrite them
        data.redirects = { ...redirects, ...(data.redirects || {}) };
        console.log(`💾 Preserving ${Object.keys(data.redirects || {}).length} redirects:`, Object.keys(data.redirects || {}));

        return data;
    }, { trackSubscriptionChanges: true });

    // Trigger feed aggregation when subscriptions change
    feedAggregator.aggregateFeeds().catch(err => console.error('Aggregation trigger failed:', err));

    res.json({ success: true, timestamp: savedData.lastSyncedAt });
}, 'Failed to save data'));

// GET /api/videos - Retrieve aggregated videos
app.get('/api/videos', asyncHandler(async (req, res) => {
    let data;
    try {
        data = await appStore.readVideoCache(DEFAULT_VIDEO_CACHE);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.json({ videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0 });
        }
        throw err;
    }
    res.json(normalizeVideoCacheThumbnails(data));
}, 'Failed to read videos'));

// GET /api/videos/status - Retrieve current aggregation progress
app.get('/api/videos/status', asyncHandler(async (req, res) => {
    res.json(feedAggregator.getAggregationStatus());
}, 'Failed to read aggregation status'));

// POST /api/videos/refresh - Trigger immediate refresh (async)
app.post('/api/videos/refresh', asyncHandler(async (req, res) => {
    // Trigger aggregation in background (don't await)
    feedAggregator.aggregateFeeds({ force: true }).catch(err => console.error('Background aggregation error:', err));

    // Return immediately
    res.json({
        success: true,
        message: 'Refresh started in background. Check back in a few minutes.'
    });
}, 'Failed to trigger refresh'));

// POST /api/videos/cache/reset - Clear aggregated video cache without touching subscriptions
app.post('/api/videos/cache/reset', asyncHandler(async (req, res) => {
    await appStore.writeVideoCache({
        videos: [],
        lastUpdated: null,
        totalChannels: 0,
        totalVideos: 0,
        channelRefreshes: {}
    });

    res.json({ success: true });
}, 'Failed to reset video cache'));

// POST /api/resolve-channel - Resolve @handle or custom URL to real channel ID
app.post('/api/resolve-channel', asyncHandler(async (req, res) => {
    const { type, value } = req.body;

    if (!type || !value) {
        return res.status(400).json({ error: 'Missing type or value' });
    }

    let url;

    if (type === 'handle') {
        // Handle format: @username
        const handle = value.startsWith('@') ? value : `@${value}`;
        url = `https://www.youtube.com/${handle}`;
    } else if (type === 'custom_url') {
        // Custom URL format: /c/username or /user/username
        url = `https://www.youtube.com/${value}`;
    } else {
        return res.status(400).json({ error: 'Invalid type' });
    }

    // Fetch the page and extract channel ID
    const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const html = response.data;

    // Extract channel ID from various possible locations
    let channelId = null;
    let title = null;

    // Method 1: Look for channel/UC... in the HTML
    const channelMatch = html.match(/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (channelMatch) {
        channelId = channelMatch[1];
    }

    // Method 2: Look for "channelId":"UC..." in JSON-LD or other structured data
    if (!channelId) {
        const jsonMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
        if (jsonMatch) {
            channelId = jsonMatch[1];
        }
    }

    // Extract title
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    if (titleMatch) {
        title = titleMatch[1];
    }

    if (!channelId) {
        return res.status(404).json({ error: 'Could not resolve channel ID' });
    }

    res.json({
        channelId,
        title: title || value,
        thumbnail: null // RSS will provide this later
    });
}, 'Failed to resolve channel'));

// POST /api/subscriptions/:id/mute - Toggle mute status for a channel
app.post('/api/subscriptions/:id/mute', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { isMuted } = req.body;

    if (typeof isMuted !== 'boolean') {
        return res.status(400).json({ error: 'isMuted must be a boolean' });
    }

    const data = await appStore.readData(DEFAULT_DATA);
    const found = data.subscriptions.some(s => s.id === id);
    if (!found) {
        return res.status(404).json({ error: 'Subscription not found' });
    }

    await appStore.updateSubscriptionField(id, 'isMuted', isMuted);
    res.json({ success: true, isMuted });
}, 'Failed to update channel'));

function closeHttpServer() {
    if (!server) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

async function shutdown(signal) {
    if (shutdownPromise) {
        return shutdownPromise;
    }

    console.log(`Received ${signal}, shutting down gracefully`);
    shutdownPromise = (async () => {
        feedAggregator?.stopScheduledRefresh?.();
        await closeHttpServer();
        appStore.close();
    })();

    try {
        await shutdownPromise;
        process.exit(0);
    } catch (error) {
        console.error('Graceful shutdown failed:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => {
    shutdown('SIGTERM');
});

process.on('SIGINT', () => {
    shutdown('SIGINT');
});

init().then(() => {
    feedAggregator = require('./feed-aggregator');
    feedAggregator.start();
    server = app.listen(PORT, () => {
        console.log(`Sync server running on port ${PORT}`);
    });
}).catch((error) => {
    console.error('Server startup failed:', error);
    process.exitCode = 1;
});
