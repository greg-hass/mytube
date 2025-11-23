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
        try {
            await fs.access(DATA_FILE);
        } catch {
            await fs.writeFile(DATA_FILE, JSON.stringify({ subscriptions: [], settings: {}, watchedVideos: [] }));
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

app.listen(PORT, () => {
    console.log(`Sync server running on port ${PORT}`);
    // Start feed aggregator
    require('./feed-aggregator');
});
