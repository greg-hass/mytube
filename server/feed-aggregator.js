const Parser = require('rss-parser');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader/1.0)'
    }
});

const DATA_FILE = path.join(__dirname, 'data', 'db.json');
const VIDEOS_FILE = path.join(__dirname, 'data', 'videos.json');
const BATCH_SIZE = 5;
const BATCH_DELAY = 2000; // 2 seconds between batches
const MAX_VIDEOS = 1000;

async function fetchChannelFeed(channelId) {
    try {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const feed = await parser.parseURL(feedUrl);

        return feed.items.map(item => ({
            id: item.id?.split(':').pop() || item.guid,
            title: item.title,
            channelId: channelId,
            channelTitle: feed.title || item.author || 'Unknown',
            publishedAt: item.pubDate || item.isoDate,
            thumbnail: item.media?.thumbnail?.[0]?.url || item.enclosure?.url || '',
            description: item.contentSnippet || item.content || '',
        }));
    } catch (error) {
        console.error(`Failed to fetch feed for ${channelId}:`, error.message);
        return [];
    }
}

async function aggregateFeeds() {
    console.log('🔄 Starting feed aggregation...');

    try {
        // Read subscriptions
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const { subscriptions = [] } = JSON.parse(data);

        if (subscriptions.length === 0) {
            console.log('No subscriptions found');
            return;
        }

        console.log(`📡 Fetching feeds for ${subscriptions.length} channels...`);

        const allVideos = [];

        // Process in batches
        for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
            const batch = subscriptions.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(sub => fetchChannelFeed(sub.id));
            const batchResults = await Promise.all(batchPromises);

            batchResults.forEach(videos => {
                allVideos.push(...videos);
            });

            console.log(`Progress: ${Math.min(i + BATCH_SIZE, subscriptions.length)}/${subscriptions.length}`);

            // Delay between batches
            if (i + BATCH_SIZE < subscriptions.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        // Deduplicate by video ID
        const uniqueVideos = Array.from(
            new Map(allVideos.map(v => [v.id, v])).values()
        );

        // Sort by publish date (newest first)
        uniqueVideos.sort((a, b) =>
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );

        // Keep only the latest MAX_VIDEOS
        const trimmedVideos = uniqueVideos.slice(0, MAX_VIDEOS);

        // Save to file
        await fs.writeFile(
            VIDEOS_FILE,
            JSON.stringify({
                videos: trimmedVideos,
                lastUpdated: new Date().toISOString(),
                totalChannels: subscriptions.length,
                totalVideos: trimmedVideos.length
            }, null, 2)
        );

        console.log(`✅ Aggregation complete: ${trimmedVideos.length} videos from ${subscriptions.length} channels`);
    } catch (error) {
        console.error('❌ Aggregation failed:', error);
    }
}

// Run immediately on start
aggregateFeeds();

// Run every 15 minutes
setInterval(aggregateFeeds, 15 * 60 * 1000);

module.exports = { aggregateFeeds };
