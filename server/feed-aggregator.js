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
            thumbnail: item.media?.thumbnail?.[0]?.url
                || item['media:group']?.['media:thumbnail']?.[0]?.$.url
                || item.enclosure?.url
                || `https://i.ytimg.com/vi/${item.id?.split(':').pop() || item.guid}/hqdefault.jpg`,
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
        // Read data to get subscriptions and settings
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsedData = JSON.parse(data);
        const subscriptions = parsedData.subscriptions || [];
        const apiKey = parsedData.settings?.apiKey;
        const useApi = parsedData.settings?.useApiForVideos && apiKey;

        if (useApi) console.log('🔑 Using YouTube API for fetching (enabled in settings)');
        else if (apiKey) console.log('ℹ️ API Key present but API fetching disabled in settings, using RSS');

        const allVideos = [];

        // Process in batches
        // If using API, we can fetch up to 50 channels at once!
        const CURRENT_BATCH_SIZE = useApi ? 50 : BATCH_SIZE;

        for (let i = 0; i < subscriptions.length; i += CURRENT_BATCH_SIZE) {
            const batch = subscriptions.slice(i, i + CURRENT_BATCH_SIZE);

            let batchVideos = [];

            if (useApi) {
                // Use YouTube API
                try {
                    const channelIds = batch.map(sub => sub.id).join(',');
                    // First get uploads playlist IDs (cost: 1 unit)
                    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${channelIds}&key=${apiKey}`;
                    const channelsRes = await axios.get(channelsUrl);

                    const channelMap = new Map();
                    channelsRes.data.items?.forEach(item => {
                        channelMap.set(item.id, {
                            uploadsId: item.contentDetails.relatedPlaylists.uploads,
                            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
                            title: item.snippet.title
                        });
                    });

                    // Fetch videos for each channel's upload playlist
                    // We can't batch playlistItems across different playlists easily without multiple requests.
                    // But we can do them in parallel.
                    const playlistPromises = batch.map(async (sub) => {
                        const channelInfo = channelMap.get(sub.id);
                        if (!channelInfo?.uploadsId) return fetchChannelFeed(sub.id); // Fallback to RSS for this channel

                        try {
                            const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${channelInfo.uploadsId}&maxResults=10&key=${apiKey}`;
                            const playlistRes = await axios.get(playlistUrl);

                            return playlistRes.data.items.map(item => ({
                                id: item.contentDetails.videoId,
                                title: item.snippet.title,
                                channelId: item.snippet.channelId,
                                channelTitle: item.snippet.channelTitle,
                                publishedAt: item.snippet.publishedAt,
                                thumbnail: item.snippet.thumbnails.maxres?.url ||
                                    item.snippet.thumbnails.high?.url ||
                                    item.snippet.thumbnails.medium?.url ||
                                    `https://i.ytimg.com/vi/${item.contentDetails.videoId}/hqdefault.jpg`,
                                description: item.snippet.description,
                                duration: null // We'd need another call for duration, skip for now or add later
                            }));
                        } catch (err) {
                            console.error(`Failed to fetch playlist for ${sub.id}, falling back to RSS`, err.message);
                            return fetchChannelFeed(sub.id);
                        }
                    });

                    const batchResults = await Promise.all(playlistPromises);
                    const fetchedCount = batchResults.reduce((acc, v) => acc + v.length, 0);
                    console.log(`  ✨ API Batch: Fetched ${fetchedCount} videos from ${batch.length} channels`);
                    batchResults.forEach(videos => batchVideos.push(...videos));

                } catch (err) {
                    console.error('API batch error, falling back to pure RSS:', err.message);
                    const batchPromises = batch.map(sub => fetchChannelFeed(sub.id));
                    const batchResults = await Promise.all(batchPromises);
                    batchResults.forEach(videos => batchVideos.push(...videos));
                }
            } else {
                // RSS Only
                const batchPromises = batch.map(sub => fetchChannelFeed(sub.id));
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(videos => batchVideos.push(...videos));
            }

            allVideos.push(...batchVideos);

            console.log(`Progress: ${Math.min(i + CURRENT_BATCH_SIZE, subscriptions.length)}/${subscriptions.length}`);

            // Delay between batches
            if (i + CURRENT_BATCH_SIZE < subscriptions.length) {
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
