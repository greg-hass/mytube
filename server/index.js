const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { readJson, writeJsonQueued, updateJsonQueued } = require('./json-store');
const { recoverDataFiles } = require('./data-integrity');
const { mergeIncomingSubscriptions } = require('./sync-utils');
const { searchChannels } = require('./channel-search');
const { normalizeVideoCacheThumbnails } = require('./video-thumbnails');
const serverPackage = require('./package.json');

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

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const VIDEOS_FILE = path.join(__dirname, 'data', 'videos.json');
const DEFAULT_DATA = { subscriptions: [], settings: {}, watchedVideos: [], redirects: {} };
const DEFAULT_VIDEO_CACHE = { videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0, channelRefreshes: {} };
let dataIntegrityEvents = [];

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for full data sync

// Ensure data directory exists
async function init() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        dataIntegrityEvents = await recoverDataFiles([
            { file: DATA_FILE, fallback: DEFAULT_DATA },
            { file: VIDEOS_FILE, fallback: DEFAULT_VIDEO_CACHE },
        ]);

        // Load or initialize db.json
        let data = await readJson(DATA_FILE, DEFAULT_DATA);

        // Merge static redirects from redirects.json if it exists
        try {
            const staticRedirectsFile = path.join(__dirname, 'redirects.json');
            const staticRedirectsContent = await fs.readFile(staticRedirectsFile, 'utf8');
            const staticRedirects = JSON.parse(staticRedirectsContent);

            data.redirects = { ...data.redirects, ...staticRedirects };
            console.log('✅ Merged static redirects:', Object.keys(staticRedirects));

            // Save back to db.json
            await writeJsonQueued(DATA_FILE, data);
        } catch (err) {
            // No static redirects or error reading, ignore
        }

    } catch (err) {
        console.error('Failed to initialize data storage:', err);
    }
}

init();

// GET /api/health - Lightweight service and data health summary
app.get('/api/health', async (req, res) => {
    try {
        const [data, videoCache] = await Promise.all([
            readJson(DATA_FILE, DEFAULT_DATA),
            readJson(VIDEOS_FILE, { videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0 })
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
app.get('/api/sync', async (req, res) => {
    try {
        const data = await readJson(DATA_FILE, DEFAULT_DATA);
        res.json(data);
    } catch (err) {
        console.error('Read error:', err);
        res.status(500).json({ error: 'Failed to read data' });
    }
});

// GET /api/channel-thumbnail - Same-origin proxy for YouTube channel thumbnails.
// Some browsers/extensions intermittently block direct yt3.googleusercontent.com
// image loads; proxying through localhost makes channel icons deterministic.
app.get('/api/channel-thumbnail', async (req, res) => {
    try {
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

        const response = await fetch(thumbnailUrl.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch thumbnail' });
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return res.status(502).json({ error: 'Thumbnail response was not an image' });
        }

        const imageBuffer = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.send(imageBuffer);
    } catch (err) {
        console.error('Channel thumbnail proxy error:', err);
        res.status(500).json({ error: 'Failed to proxy thumbnail' });
    }
});

// GET /api/channel-search?q=... - Keyword/fuzzy channel discovery without YouTube Data API.
app.get('/api/channel-search', async (req, res) => {
    try {
        const query = String(req.query.q || '').trim();
        if (query.length < 2) {
            return res.json({ results: [] });
        }

        const results = await searchChannels(query, { limit: 8 });
        res.json({ results });
    } catch (err) {
        console.error('Channel search error:', err);
        res.status(500).json({ error: 'Failed to search channels' });
    }
});

// POST /api/sync - Overwrite all data (simple sync)
app.post('/api/sync', async (req, res) => {
    try {
        const data = req.body;

        // Basic validation
        if (!data || typeof data !== 'object') {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        // Add timestamp
        data.lastSyncedAt = new Date().toISOString();

        const savedData = await updateJsonQueued(DATA_FILE, DEFAULT_DATA, (existingData) => {
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
        });

        // Trigger feed aggregation when subscriptions change
        const { aggregateFeeds } = require('./feed-aggregator');
        aggregateFeeds().catch(err => console.error('Aggregation trigger failed:', err));

        res.json({ success: true, timestamp: savedData.lastSyncedAt });
    } catch (err) {
        console.error('Write error:', err);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// GET /api/videos - Retrieve aggregated videos
app.get('/api/videos', async (req, res) => {
    try {
        const data = await readJson(VIDEOS_FILE, { videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0 });
        res.json(normalizeVideoCacheThumbnails(data));
    } catch (err) {
        // If file doesn't exist yet, return empty
        if (err.code === 'ENOENT') {
            res.json({ videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0 });
        } else {
            console.error('Read videos error:', err);
            res.status(500).json({ error: 'Failed to read videos' });
        }
    }
});

// GET /api/videos/status - Retrieve current aggregation progress
app.get('/api/videos/status', async (req, res) => {
    try {
        const { getAggregationStatus } = require('./feed-aggregator');
        res.json(getAggregationStatus());
    } catch (err) {
        console.error('Read aggregation status error:', err);
        res.status(500).json({ error: 'Failed to read aggregation status' });
    }
});

// POST /api/videos/refresh - Trigger immediate refresh (async)
app.post('/api/videos/refresh', async (req, res) => {
    try {
        const { aggregateFeeds } = require('./feed-aggregator');

        // Trigger aggregation in background (don't await)
        aggregateFeeds({ force: true }).catch(err => console.error('Background aggregation error:', err));

        // Return immediately
        res.json({
            success: true,
            message: 'Refresh started in background. Check back in a few minutes.'
        });
    } catch (err) {
        console.error('Refresh trigger error:', err);
        res.status(500).json({ error: 'Failed to trigger refresh' });
    }
});

// POST /api/videos/cache/reset - Clear aggregated video cache without touching subscriptions
app.post('/api/videos/cache/reset', async (req, res) => {
    try {
        await writeJsonQueued(VIDEOS_FILE, {
            videos: [],
            lastUpdated: null,
            totalChannels: 0,
            totalVideos: 0,
            channelRefreshes: {}
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Video cache reset error:', err);
        res.status(500).json({ error: 'Failed to reset video cache' });
    }
});

// POST /api/resolve-channel - Resolve @handle or custom URL to real channel ID
app.post('/api/resolve-channel', async (req, res) => {
    try {
        const { type, value } = req.body;

        if (!type || !value) {
            return res.status(400).json({ error: 'Missing type or value' });
        }

        // Use scraping to resolve the channel
        const axios = require('axios');
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
    } catch (err) {
        console.error('Resolve channel error:', err.message);
        res.status(500).json({ error: 'Failed to resolve channel' });
    }
});

// POST /api/subscriptions/:id/mute - Toggle mute status for a channel
app.post('/api/subscriptions/:id/mute', async (req, res) => {
    try {
        const { id } = req.params;
        const { isMuted } = req.body;

        if (typeof isMuted !== 'boolean') {
            return res.status(400).json({ error: 'isMuted must be a boolean' });
        }

        let found = false;
        await updateJsonQueued(DATA_FILE, DEFAULT_DATA, (data) => {
            const subIndex = data.subscriptions.findIndex(s => s.id === id);
            if (subIndex === -1) {
                return data;
            }

            found = true;
            data.subscriptions[subIndex].isMuted = isMuted;
            return data;
        });

        if (!found) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        res.json({ success: true, isMuted });
    } catch (err) {
        console.error('Mute channel error:', err);
        res.status(500).json({ error: 'Failed to update channel' });
    }
});

app.listen(PORT, () => {
    console.log(`Sync server running on port ${PORT}`);
    // Start feed aggregator
    require('./feed-aggregator');
});
