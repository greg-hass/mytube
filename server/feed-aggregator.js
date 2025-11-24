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

        const videos = feed.items.map(item => ({
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

        // Extract channel metadata from feed
        const channelMetadata = {
            title: feed.title || 'Unknown Channel',
            thumbnail: null // Will be fetched separately
        };

        return { videos, channelMetadata };
    } catch (error) {
        console.error(`Failed to fetch feed for ${channelId}:`, error.message);
        return { videos: [], channelMetadata: null };
    }
}

// Fetch real channel thumbnail by scraping the channel page
async function fetchChannelThumbnail(channelId) {
    try {
        const url = `https://www.youtube.com/channel/${channelId}`;
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const html = response.data;

        // Look for channel avatar in meta tags
        const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (avatarMatch) {
            return avatarMatch[1];
        }

        // Alternative: Look for profile image in JSON-LD
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
        let quotaExceeded = false;

        // Process in batches
        // If using API, we can fetch up to 50 channels at once!
        // Reducing to 30 to avoid potential URL length issues or 403s
        const CURRENT_BATCH_SIZE = useApi ? 30 : BATCH_SIZE;

        // Apply existing redirects from db.json (even if API is unavailable)
        // This ensures static redirects work even when quota is exhausted
        let hasRedirectUpdates = false;
        const redirectedSubs = [];
        const seenIds = new Set();

        for (const sub of subscriptions) {
            let finalId = sub.id;
            let finalTitle = sub.title;
            let finalThumb = sub.thumbnail;

            // Check if this subscription has a redirect
            if (parsedData.redirects && parsedData.redirects[sub.id]) {
                finalId = parsedData.redirects[sub.id];
                console.log(`🔀 Applying redirect: ${sub.id} -> ${finalId}`);
                hasRedirectUpdates = true;
            }

            // Deduplicate
            if (!seenIds.has(finalId)) {
                seenIds.add(finalId);
                redirectedSubs.push({
                    ...sub,
                    id: finalId,
                    title: finalTitle,
                    thumbnail: finalThumb
                });
            } else {
                console.log(`  (Skipping duplicate: ${finalId})`);
            }
        }

        if (hasRedirectUpdates) {
            parsedData.subscriptions = redirectedSubs;
            await fs.writeFile(DATA_FILE, JSON.stringify(parsedData, null, 2));
            console.log('💾 Updated subscriptions with redirects');
            // Update local reference
            subscriptions.length = 0;
            subscriptions.push(...redirectedSubs);
        }

        // Resolve handles/custom URLs to real IDs if API is available
        if (useApi) {
            let hasUpdates = false;
            const resolvedSubs = [];
            const seenIds = new Set();

            for (const sub of subscriptions) {
                if (sub.id.startsWith('handle_') || sub.id.startsWith('custom_')) {
                    try {
                        let resolveUrl;
                        let param;
                        if (sub.id.startsWith('handle_')) {
                            param = sub.id.replace('handle_', '');
                            // Handles must include @
                            if (!param.startsWith('@')) param = '@' + param;
                            resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(param)}&key=${apiKey}`;
                        } else {
                            param = sub.id.replace('custom_', '');
                            resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${encodeURIComponent(param)}&key=${apiKey}`;
                        }

                        const res = await axios.get(resolveUrl);
                        if (res.data.items?.[0]) {
                            const realId = res.data.items[0].id;
                            const realTitle = res.data.items[0].snippet.title;
                            const realThumb = res.data.items[0].snippet.thumbnails.high?.url;

                            console.log(`✨ Resolved ${sub.id} -> ${realId} (${realTitle})`);

                            // Save redirect so clients can update too
                            if (!parsedData.redirects) parsedData.redirects = {};
                            parsedData.redirects[sub.id] = realId;

                            // Check if we already have this ID (either in original list or resolved list)
                            // We need to check against the *future* list we are building
                            if (!seenIds.has(realId)) {
                                resolvedSubs.push({
                                    ...sub,
                                    id: realId,
                                    title: realTitle || sub.title,
                                    thumbnail: realThumb || sub.thumbnail
                                });
                                seenIds.add(realId);
                            } else {
                                console.log(`  (Merged with existing subscription)`);
                            }
                            hasUpdates = true;
                            continue;
                        }
                    } catch (err) {
                        console.error(`Failed to resolve handle ${sub.id}:`, err.message);
                    }
                }

                // Keep existing valid sub if not duplicate
                if (!seenIds.has(sub.id)) {
                    resolvedSubs.push(sub);
                    seenIds.add(sub.id);
                }
            }

            if (hasUpdates) {
                parsedData.subscriptions = resolvedSubs;
                await fs.writeFile(DATA_FILE, JSON.stringify(parsedData, null, 2));
                console.log('💾 Updated subscriptions with resolved IDs');
                // Update local reference
                subscriptions.length = 0;
                subscriptions.push(...resolvedSubs);
            }
        }

        for (let i = 0; i < subscriptions.length; i += CURRENT_BATCH_SIZE) {
            const batch = subscriptions.slice(i, i + CURRENT_BATCH_SIZE);

            let batchVideos = [];

            if (useApi && !quotaExceeded) {
                // Use YouTube API (unless quota was already exceeded in a previous batch)
                try {
                    // Filter out any non-UC IDs (like handles that failed resolution) to prevent API errors
                    const validIds = batch.map(sub => sub.id).filter(id => id.startsWith('UC'));

                    if (validIds.length === 0) {
                        // All IDs in this batch are invalid/handles, fallback to RSS
                        throw new Error('No valid UC IDs in batch');
                    }

                    const channelIds = validIds.join(',');
                    // First get uploads playlist IDs (cost: 1 unit)
                    const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${channelIds}&key=${apiKey}`;
                    const channelsRes = await axios.get(channelsUrl);

                    const channelMap = new Map();
                    channelsRes.data.items?.forEach(item => {
                        const thumbnail = item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url;
                        const title = item.snippet.title;

                        channelMap.set(item.id, {
                            uploadsId: item.contentDetails.relatedPlaylists.uploads,
                            thumbnail,
                            title
                        });

                        // Update subscription metadata
                        const subIndex = subscriptions.findIndex(s => s.id === item.id);
                        if (subIndex !== -1) {
                            if (title) subscriptions[subIndex].title = title;
                            if (thumbnail) subscriptions[subIndex].thumbnail = thumbnail;
                        }
                    });

                    // Fetch videos for each channel's upload playlist
                    // We can't batch playlistItems across different playlists easily without multiple requests.
                    // But we can do them in parallel.
                    const playlistPromises = batch.map(async (sub) => {
                        const channelInfo = channelMap.get(sub.id);
                        if (!channelInfo?.uploadsId) {
                            const { videos } = await fetchChannelFeed(sub.id);
                            return videos;
                        }

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
                            const { videos } = await fetchChannelFeed(sub.id);
                            return videos;
                        }
                    });

                    const batchResults = await Promise.all(playlistPromises);
                    const fetchedCount = batchResults.reduce((acc, v) => acc + v.length, 0);
                    console.log(`  ✨ API Batch: Fetched ${fetchedCount} videos from ${batch.length} channels`);
                    batchResults.forEach(videos => batchVideos.push(...videos));

                } catch (err) {
                    console.error('API batch error, falling back to pure RSS:', err.message, err.response?.data?.error);

                    // Check for quota exceeded
                    if (err.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
                        console.warn('⚠️ API Quota limit reached! Switching to RSS for all remaining batches.');
                        // We will update the file at the end of the function
                        quotaExceeded = true;
                    }

                    // Fallback to RSS with delay to avoid 429s
                    for (const sub of batch) {
                        const { videos, channelMetadata } = await fetchChannelFeed(sub.id);
                        batchVideos.push(...videos);

                        // Update subscription metadata if we got it from RSS
                        if (channelMetadata && channelMetadata.title) {
                            const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                            if (subIndex !== -1) {
                                subscriptions[subIndex].title = channelMetadata.title;
                            }
                        }

                        // Small delay between RSS fetches in fallback mode
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Fetch thumbnails in parallel for this batch
                    console.log(`  🖼️  Fetching thumbnails for ${batch.length} channels...`);
                    const thumbnailPromises = batch.map(async (sub, idx) => {
                        const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                        console.log(`    [${idx}] ${sub.id}: subIndex=${subIndex}, hasThumbnail=${!!subscriptions[subIndex]?.thumbnail}`);

                        if (subIndex !== -1 && (!subscriptions[subIndex].thumbnail || subscriptions[subIndex].thumbnail.includes('ui-avatars'))) {
                            try {
                                console.log(`    [${idx}] Fetching thumbnail for ${sub.id}...`);
                                const thumbnail = await fetchChannelThumbnail(sub.id);
                                if (thumbnail) {
                                    subscriptions[subIndex].thumbnail = thumbnail;
                                    console.log(`    ✓ ${sub.id}: Got thumbnail`);
                                } else {
                                    console.log(`    ✗ ${sub.id}: No thumbnail found`);
                                }
                            } catch (err) {
                                console.error(`    ✗ ${sub.id}: Error -`, err.message);
                            }
                        } else {
                            console.log(`    [${idx}] Skipping ${sub.id} (already has thumbnail or not found)`);
                        }
                    });
                    await Promise.all(thumbnailPromises);
                }
            } else if (quotaExceeded) {
                // Quota was exceeded in a previous batch, use RSS for remaining batches
                console.log(`  📡 RSS Mode: Fetching ${batch.length} channels (quota exhausted)`);
                for (const sub of batch) {
                    const { videos, channelMetadata } = await fetchChannelFeed(sub.id);
                    batchVideos.push(...videos);

                    // Update subscription metadata if we got it from RSS
                    if (channelMetadata && channelMetadata.title) {
                        const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                        if (subIndex !== -1) {
                            subscriptions[subIndex].title = channelMetadata.title;
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Fetch thumbnails in parallel for this batch
                const thumbnailPromises = batch.map(async sub => {
                    const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                    if (subIndex !== -1 && (!subscriptions[subIndex].thumbnail || subscriptions[subIndex].thumbnail.includes('ui-avatars'))) {
                        const thumbnail = await fetchChannelThumbnail(sub.id);
                        if (thumbnail) {
                            subscriptions[subIndex].thumbnail = thumbnail;
                        }
                    }
                });
                await Promise.all(thumbnailPromises);
            } else {
                // RSS Only
                const batchPromises = batch.map(async sub => {
                    const { videos, channelMetadata } = await fetchChannelFeed(sub.id);

                    // Update subscription metadata if we got it from RSS
                    if (channelMetadata && channelMetadata.title) {
                        const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                        if (subIndex !== -1) {
                            subscriptions[subIndex].title = channelMetadata.title;
                        }
                    }

                    return videos;
                });
                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(videos => batchVideos.push(...videos));

                // Fetch thumbnails in parallel for this batch
                const thumbnailPromises = batch.map(async sub => {
                    const subIndex = subscriptions.findIndex(s => s.id === sub.id);
                    if (subIndex !== -1 && (!subscriptions[subIndex].thumbnail || subscriptions[subIndex].thumbnail.includes('ui-avatars'))) {
                        const thumbnail = await fetchChannelThumbnail(sub.id);
                        if (thumbnail) {
                            subscriptions[subIndex].thumbnail = thumbnail;
                        }
                    }
                });
                await Promise.all(thumbnailPromises);
            }

            allVideos.push(...batchVideos);

            console.log(`Progress: ${Math.min(i + CURRENT_BATCH_SIZE, subscriptions.length)}/${subscriptions.length}`);

            // Delay between batches
            if (i + CURRENT_BATCH_SIZE < subscriptions.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        // Update subscriptions with resolved IDs if any changed
        // This fixes the "duplicate channel" issue where we have both @handle and UC...
        // We need to map old IDs to new IDs based on what we found in the API response
        // The API response gave us 'channelId' in the items.

        // We can't easily track which specific sub resolved to which ID in the batch loop above without more complex logic.
        // BUT, we can look at the videos we fetched.
        // If we have a video with channelId 'UC...' but our subscription list only has 'handle_@...', we should update it.

        // Actually, a better way is to do it inside the batch loop or right here.
        // Let's iterate through allVideos and see if we can map handles to IDs.

        let subscriptionsChanged = false;
        const subMap = new Map(subscriptions.map(s => [s.id, s]));

        // Create a map of resolved IDs from the videos we fetched
        // We know that for a given video, video.channelId is the REAL ID.
        // We also know which 'sub.id' we *tried* to fetch (but we lost that context in allVideos list).

        // Wait, the batch loop had the context.
        // Let's just rely on the fact that if we have a subscription starting with 'handle_' or 'custom_',
        // and we have videos for a channel that *matches* that handle (by title? no, risky).

        // Correct approach:
        // In the API fetch block (lines 75-82), we mapped input IDs to resolved IDs.
        // We should capture that mapping and apply it.
        // Since I can't easily edit the batch loop without a huge diff, I will add a separate resolution step or rely on the client?
        // No, server must be authoritative.

        // Let's try to fix it by checking if we have any 'handle_' subs that we can resolve now.
        // Actually, the API 'channels' call (line 72) returns the ID.
        // If we passed 'forHandle', we'd get it. But we passed 'id'.
        // If we passed 'handle_@foo', the API would fail for that ID.
        // So the current code probably FAILS to fetch for handles via API because it passes 'handle_@foo' as 'id' to YouTube API?
        // YouTube API 'id' parameter expects UC IDs. It does NOT accept handles there.
        // So my previous API implementation (line 72) is actually BROKEN for handles!
        // It tries to fetch `id=handle_@foo`, which returns nothing.
        // Then it falls back to RSS (line 89).
        // RSS fetches `feeds/videos.xml?channel_id=handle_@foo` -> This works? No, RSS needs channel_id too?
        // Actually RSS might work with `?user=` or `?handle=`? No.

        // If the user added a handle, the ID is `handle_@foo`.
        // The aggregator needs to RESOLVE this handle to a UC ID first.
        // The client *tries* to resolve it (AddChannelModal), but if it fails (no API key on client), it saves `handle_@foo`.

        // So the server needs to resolve handles.
        // I will add a resolution step at the start of aggregation.

        const resolvedSubs = [];
        let hasResolutionUpdates = false;

        for (const sub of subscriptions) {
            if (sub.id.startsWith('handle_') || sub.id.startsWith('custom_')) {
                // Try to resolve
                try {
                    // We need to use 'forHandle' or 'forUsername' or search
                    // But we only have 'id' param in the batch call.
                    // Let's do a quick resolution here if we have an API key.
                    if (apiKey) {
                        let resolveUrl;
                        let param;
                        if (sub.id.startsWith('handle_')) {
                            param = sub.id.replace('handle_', '');
                            resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(param)}&key=${apiKey}`;
                        } else {
                            param = sub.id.replace('custom_', '');
                            resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${encodeURIComponent(param)}&key=${apiKey}`;
                        }

                        const res = await axios.get(resolveUrl);
                        if (res.data.items?.[0]) {
                            const realId = res.data.items[0].id;
                            const realTitle = res.data.items[0].snippet.title;
                            const realThumb = res.data.items[0].snippet.thumbnails.high?.url;

                            console.log(`✨ Resolved ${sub.id} -> ${realId} (${realTitle})`);

                            // Check if we already have this ID to avoid duplicates
                            const existing = subscriptions.find(s => s.id === realId);
                            if (!existing) {
                                resolvedSubs.push({
                                    ...sub,
                                    id: realId,
                                    title: realTitle || sub.title,
                                    thumbnail: realThumb || sub.thumbnail
                                });
                            } else {
                                console.log(`  (Merged with existing subscription)`);
                            }
                            hasResolutionUpdates = true;
                            continue; // Skip adding the old handle sub
                        }
                    }
                } catch (err) {
                    console.error(`Failed to resolve handle ${sub.id}:`, err.message);
                }
            }
            resolvedSubs.push(sub);
        }

        if (hasResolutionUpdates) {
            // Update subscriptions in memory and file
            parsedData.subscriptions = resolvedSubs;
            await fs.writeFile(DATA_FILE, JSON.stringify(parsedData, null, 2));
            console.log('💾 Updated subscriptions with resolved IDs');
            // Update local variable for the rest of the function
            // subscriptions.length might change, but we are iterating a copy or index?
            // We need to restart or use the new list.
            // Since we are about to start the batch loop (wait, I am inserting this AFTER the loop in the replace block? No, I should insert it BEFORE).
            // Ah, the tool allows me to replace a block.
            // I will insert this logic BEFORE the batch loop.
            // But I need to target the right lines.
            // The current replace block targets the END of the loop.
            // I should cancel this tool call and make a new one targeting the START.
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

        // Save updated subscriptions (with metadata from RSS) back to db.json
        // IMPORTANT: Preserve redirects that were merged during init()
        parsedData.subscriptions = subscriptions;
        if (!parsedData.redirects) {
            parsedData.redirects = {};
        }
        await fs.writeFile(DATA_FILE, JSON.stringify(parsedData, null, 2));
        console.log('💾 Saved updated subscription metadata (preserving', Object.keys(parsedData.redirects).length, 'redirects)');

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

        // Update quota usage in db.json if we used API
        if (useApi) {
            // Calculate quota used:
            // 1 unit for channels list
            // 1 unit per playlist fetch (we did 1 fetch per channel that had uploads)
            // Note: This is an approximation.
            const quotaCost = 1 + subscriptions.length;

            // Read fresh data to avoid race conditions (though we are single threaded mostly)
            const currentData = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));

            // Initialize if missing
            if (!currentData.settings) currentData.settings = {};
            if (!currentData.settings.quotaUsed) currentData.settings.quotaUsed = 0;

            if (quotaExceeded) {
                // Force to max if we hit the limit
                currentData.settings.quotaUsed = 10000;
                console.log(`📊 Quota limit hit. Local counter forced to: 10000`);
            } else {
                currentData.settings.quotaUsed += quotaCost;
                console.log(`📊 Quota used this run: ${quotaCost}. Total: ${currentData.settings.quotaUsed}`);
            }

            await fs.writeFile(DATA_FILE, JSON.stringify(currentData, null, 2));
        }

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
