const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const VIDEOS_FILE = path.join(__dirname, 'data', 'videos.json');

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for full data sync

// Ensure data directory exists
async function init() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });

        // Load or initialize db.json
        let data = { subscriptions: [], settings: {}, watchedVideos: [], redirects: {} };
        try {
            const fileContent = await fs.readFile(DATA_FILE, 'utf8');
            data = JSON.parse(fileContent);
        } catch (err) {
            // File doesn't exist, use default
        }

        // Merge static redirects from redirects.json if it exists
        try {
            const staticRedirectsFile = path.join(__dirname, 'redirects.json');
            const staticRedirectsContent = await fs.readFile(staticRedirectsFile, 'utf8');
            const staticRedirects = JSON.parse(staticRedirectsContent);

            data.redirects = { ...data.redirects, ...staticRedirects };
            console.log('✅ Merged static redirects:', Object.keys(staticRedirects));

            // Save back to db.json
            await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
        } catch (err) {
            // No static redirects or error reading, ignore
        }

    } catch (err) {
        console.error('Failed to initialize data storage:', err);
    }
}

init();

// GET /api/sync - Retrieve all data
app.get('/api/sync', async (req, res) => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error('Read error:', err);
        res.status(500).json({ error: 'Failed to read data' });
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

        // Read existing data to get redirects
        let existingData = {};
        try {
            const fileContent = await fs.readFile(DATA_FILE, 'utf8');
            existingData = JSON.parse(fileContent);
        } catch (e) {
            // ignore if file doesn't exist
        }

        // Apply redirects to incoming subscriptions
        if (existingData.redirects && data.subscriptions) {
            const redirects = existingData.redirects;
            const seenIds = new Set();
            const uniqueSubs = [];

            data.subscriptions.forEach(sub => {
                let finalId = sub.id;
                // Check if this ID should be redirected
                if (redirects[sub.id]) {
                    console.log(`🔀 Server applying redirect on sync: ${sub.id} -> ${redirects[sub.id]}`);
                    finalId = redirects[sub.id];
                }

                // Deduplicate
                if (!seenIds.has(finalId)) {
                    seenIds.add(finalId);
                    // Use the redirected ID
                    uniqueSubs.push({ ...sub, id: finalId });
                }
            });

            data.subscriptions = uniqueSubs;
            // Preserve redirects in the new data
            data.redirects = { ...existingData.redirects, ...(data.redirects || {}) };
        }

        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));

        // Trigger feed aggregation when subscriptions change
        const { aggregateFeeds } = require('./feed-aggregator');
        aggregateFeeds().catch(err => console.error('Aggregation trigger failed:', err));

        res.json({ success: true, timestamp: data.lastSyncedAt });
    } catch (err) {
        console.error('Write error:', err);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// GET /api/videos - Retrieve aggregated videos
app.get('/api/videos', async (req, res) => {
    try {
        const data = await fs.readFile(VIDEOS_FILE, 'utf8');
        res.json(JSON.parse(data));
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

// POST /api/videos/refresh - Trigger immediate refresh (async)
app.post('/api/videos/refresh', async (req, res) => {
    try {
        const { aggregateFeeds } = require('./feed-aggregator');

        // Trigger aggregation in background (don't await)
        aggregateFeeds().catch(err => console.error('Background aggregation error:', err));

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

app.listen(PORT, () => {
    console.log(`Sync server running on port ${PORT}`);
    // Start feed aggregator
    require('./feed-aggregator');
});
