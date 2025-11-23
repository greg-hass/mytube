import { XMLParser } from 'fast-xml-parser';
import { fetchWithProxy } from './cors-proxies';
import { resolveTemporaryChannelFromRSS, fetchVideosForChannelsAPI } from './youtube-api';
import type { YouTubeVideo, RSSVideoEntry } from '../types/youtube';

const RSS_BASE_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

// Configure XML parser
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Extracts video ID from various YouTube ID formats
 * Handles formats like "yt:video:VIDEO_ID" or just "VIDEO_ID"
 */
function extractVideoId(id: string): string {
  if (id.startsWith('yt:video:')) {
    return id.replace('yt:video:', '');
  }
  return id;
}

/**
 * Transforms RSS entry to YouTubeVideo format
 */
function transformRSSEntry(entry: RSSVideoEntry, channelId: string): YouTubeVideo {
  const videoId = extractVideoId(entry.id);
  const originalThumbnail = entry['media:group']?.['media:thumbnail']?.['@_url'];

  return {
    id: videoId,
    title: entry.title || 'Untitled',
    description: entry['media:group']?.['media:description'] || '',
    thumbnail: getThumbnailUrl(videoId, originalThumbnail),
    channelId,
    channelTitle: entry.author?.name || 'Unknown Channel',
    publishedAt: entry.published || new Date().toISOString(),
  };
}

/**
 * Gets a fallback thumbnail URL with error handling
 */
function getThumbnailUrl(videoId: string, originalUrl?: string): string {
  // If original URL exists, use it
  if (originalUrl && originalUrl.trim() !== '') {
    return originalUrl;
  }

  // Try different thumbnail sizes in order of preference
  const thumbnailSizes = [
    'hqdefault.jpg',
    'mqdefault.jpg',
    'sddefault.jpg',
    'default.jpg'
  ];

  for (const size of thumbnailSizes) {
    try {
      return `https://i.ytimg.com/vi/${videoId}/${size}`;
    } catch (error) {
      console.warn(`Failed to generate thumbnail URL for ${videoId}:`, error);
    }
  }

  // Fallback to a placeholder
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%23333'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='14' fill='%23666'%3EVideo%3C/text%3E%3C/svg%3E`;
}

// Rate limiting for RSS requests
let lastRSSRequestTime = 0;
const RSS_RATE_LIMIT_DELAY = 2000; // 2 seconds between RSS requests

/**
 * Rate limit RSS requests to avoid 429 errors
 */
async function rateLimitRSSRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRSSRequestTime;

  if (timeSinceLastRequest < RSS_RATE_LIMIT_DELAY) {
    const waitTime = RSS_RATE_LIMIT_DELAY - timeSinceLastRequest;
    if (waitTime > 1000) {
      console.warn(`⏳ RSS rate limiting: waiting ${waitTime}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRSSRequestTime = Date.now();
}

/**
 * Fetches RSS feed for a single channel
 * @param channelId - YouTube channel ID
 * @returns Promise resolving to array of YouTubeVideo objects
 */

/**
 * Fetches RSS feed for a single channel
 * @param channelId - YouTube channel ID
 * @returns Promise resolving to object with videos and channel title
 */
export async function fetchChannelRSSFeed(channelId: string): Promise<{ videos: YouTubeVideo[], title?: string }> {
  // Use store or env, avoid process.env in browser
  const { apiKey, useApiForVideos } = await import('../store/useStore').then(m => m.useStore.getState());
  const effectiveApiKey = apiKey || import.meta.env.VITE_YOUTUBE_API_KEY;

  // Only use API if key exists AND it is enabled in settings
  if (effectiveApiKey && useApiForVideos) {
    try {
      // fetchVideosForChannelsAPI expects an array of channel IDs
      const videos = await fetchVideosForChannelsAPI([channelId], effectiveApiKey);
      // API returns videos with channelTitle, so we can extract it from the first video
      const title = videos.length > 0 ? videos[0].channelTitle : undefined;
      return { videos, title };
    } catch (apiError) {
      console.warn('YouTube API fallback failed, falling back to RSS:', apiError);
    }
  }

  const feedUrl = `${RSS_BASE_URL}${channelId}`;

  // Rate limit RSS requests
  await rateLimitRSSRequest();

  try {
    const xmlText = await fetchWithProxy(feedUrl);

    // Validate that we got XML content
    if (!xmlText.includes('<?xml') && !xmlText.includes('<feed')) {
      throw new Error('Invalid response - not XML');
    }

    // Parse the XML response
    const parsed = parser.parse(xmlText);
    // Navigate the parsed structure
    const feed = parsed.feed;
    if (!feed) {
      throw new Error('Invalid RSS feed structure - no feed element');
    }

    const feedTitle = feed.title;

    const entries = feed.entry;
    if (!entries) {
      // No videos yet for this channel
      return { videos: [], title: feedTitle };
    }

    // Handle both single entry and array of entries
    const entryArray = Array.isArray(entries) ? entries : [entries];

    const videos = entryArray.map((entry: RSSVideoEntry) =>
      transformRSSEntry(entry, channelId)
    );

    return { videos, title: feedTitle };
  } catch (error) {
    // Attempt fallback using YouTube Data API if API key is set.
    const { apiKey, useApiForVideos } = await import('../store/useStore').then(m => m.useStore.getState());
    const effectiveApiKey = apiKey || import.meta.env.VITE_YOUTUBE_API_KEY;

    if (effectiveApiKey && useApiForVideos) {
      try {
        const videos = await fetchVideosForChannelsAPI([channelId], effectiveApiKey);
        const title = videos.length > 0 ? videos[0].channelTitle : undefined;
        return { videos, title };
      } catch (apiError) {
        console.warn('API fallback failed:', apiError);
      }
    }
    throw error;
  }
}

/**
 * Fetches RSS feeds for multiple channels in parallel with concurrency control
 * @param channelIds - Array of YouTube channel IDs
 * @param maxConcurrent - Maximum number of concurrent requests (default: 10)
 * @returns Promise resolving to array of YouTubeVideo objects
 */
export async function fetchMultipleChannelFeeds(
  channelIds: string[],
  maxConcurrent = 10
): Promise<YouTubeVideo[]> {
  const results: YouTubeVideo[] = [];
  const errors: Array<{ channelId: string; error: Error }> = [];
  const resolvedChannels = new Map<string, { id: string; title: string; thumbnail?: string }>();

  // Expose resolved channels map for the caller to use
  (fetchMultipleChannelFeeds as any).resolvedChannels = resolvedChannels;

  // Process channels in chunks to limit concurrency
  for (let i = 0; i < channelIds.length; i += maxConcurrent) {
    const chunk = channelIds.slice(i, i + maxConcurrent);

    const promises = chunk.map(async (originalChannelId) => {
      try {
        let channelId = originalChannelId;

        // Resolve temporary channel IDs (handle_ or custom_) to real YouTube channel IDs
        if (channelId.startsWith('handle_') || channelId.startsWith('custom_')) {
          const { apiKey } = await import('../store/useStore').then(m => m.useStore.getState());
          const resolved = await resolveTemporaryChannelFromRSS(channelId, apiKey);
          if (resolved) {
            resolvedChannels.set(originalChannelId, resolved); // Store with original ID
            console.log(`✅ Resolved temporary channel ${originalChannelId} to ${resolved.id} (${resolved.title})`);
            // Use the real channel ID for RSS fetching
            channelId = resolved.id;
          }
        }

        const { videos, title } = await fetchChannelRSSFeed(channelId);

        // If we got a title from RSS/API and we haven't already resolved this channel (or it's a direct ID update)
        // Update the resolvedChannels map so the UI can update the title
        if (title && !resolvedChannels.has(originalChannelId)) {
          // Only update if it's a direct ID (starts with UC) to avoid overwriting handle resolutions
          // OR if we want to ensure we have the latest title
          resolvedChannels.set(originalChannelId, {
            id: channelId,
            title: title,
            // We don't get a thumbnail from RSS feed usually, so leave it undefined to keep existing
          });
        }

        // Update videos with resolved channel information if available
        const resolved = resolvedChannels.get(originalChannelId);
        if (resolved) {
          return videos.map(video => ({
            ...video,
            channelTitle: resolved.title,
            channelId: resolved.id,
          }));
        }

        return videos;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ channelId: originalChannelId, error: err });
        console.error(`Error fetching feed for ${originalChannelId}:`, err);
        return [];
      }
    });

    const chunkResults = await Promise.all(promises);
    chunkResults.forEach(videos => results.push(...videos));
  }

  // Log summary if there were errors
  if (errors.length > 0) {
    console.warn(
      `Failed to fetch ${errors.length} out of ${channelIds.length} channels`,
      errors
    );
  }

  // Return resolved channels for updating storage
  (fetchMultipleChannelFeeds as any).resolvedChannels = resolvedChannels;

  // Sort by publish date (newest first)
  return results.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

/**
 * Fetches RSS feeds with retry logic
 * @param channelId - YouTube channel ID
 * @param maxRetries - Maximum number of retry attempts (default: 1)
 * @param retryDelay - Delay between retries in milliseconds (default: 5000)
 * @returns Promise resolving to array of YouTubeVideo objects
 */
export async function fetchChannelRSSFeedWithRetry(
  channelId: string,
  maxRetries: number = 1,
  retryDelay: number = 5000
): Promise<YouTubeVideo[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { videos } = await fetchChannelRSSFeed(channelId);
      return videos;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        console.log(
          `Retry ${attempt + 1}/${maxRetries} for channel ${channelId} after ${retryDelay}ms`
        );
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw lastError || new Error('Unknown error during RSS fetch');
}
