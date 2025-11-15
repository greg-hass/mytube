import { XMLParser } from 'fast-xml-parser';
import type { YouTubeVideo, RSSVideoEntry } from '../types/youtube';

const CORS_PROXY = 'https://corsproxy.io/?';
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

  return {
    id: videoId,
    title: entry.title || 'Untitled',
    description: entry['media:group']?.['media:description'] || '',
    thumbnail: entry['media:group']?.['media:thumbnail']?.['@_url'] ||
               `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelId,
    channelTitle: entry.author?.name || 'Unknown Channel',
    publishedAt: entry.published || new Date().toISOString(),
  };
}

/**
 * Fetches RSS feed for a single channel
 * @param channelId - YouTube channel ID
 * @returns Promise resolving to array of YouTubeVideo objects
 */
export async function fetchChannelRSSFeed(channelId: string): Promise<YouTubeVideo[]> {
  try {
    const feedUrl = `${RSS_BASE_URL}${channelId}`;
    const proxiedUrl = `${CORS_PROXY}${encodeURIComponent(feedUrl)}`;

    const response = await fetch(proxiedUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();
    const parsed = parser.parse(xmlText);

    // Navigate the parsed structure
    const feed = parsed.feed;
    if (!feed) {
      throw new Error('Invalid RSS feed structure - no feed element');
    }

    const entries = feed.entry;
    if (!entries) {
      // No videos yet for this channel
      return [];
    }

    // Handle both single entry and array of entries
    const entryArray = Array.isArray(entries) ? entries : [entries];

    return entryArray.map((entry: RSSVideoEntry) =>
      transformRSSEntry(entry, channelId)
    );
  } catch (error) {
    console.error(`Failed to fetch RSS feed for channel ${channelId}:`, error);
    throw error;
  }
}

/**
 * Fetches RSS feeds for multiple channels in parallel with concurrency control
 * @param channelIds - Array of YouTube channel IDs
 * @param maxConcurrent - Maximum number of concurrent requests (default: 10)
 * @returns Promise resolving to array of all videos from all channels
 */
export async function fetchMultipleChannelFeeds(
  channelIds: string[],
  maxConcurrent: number = 10
): Promise<YouTubeVideo[]> {
  const results: YouTubeVideo[] = [];
  const errors: Array<{ channelId: string; error: Error }> = [];

  // Process channels in batches to respect concurrency limit
  for (let i = 0; i < channelIds.length; i += maxConcurrent) {
    const batch = channelIds.slice(i, i + maxConcurrent);

    const batchPromises = batch.map(async (channelId) => {
      try {
        const videos = await fetchChannelRSSFeed(channelId);
        return { channelId, videos, error: null };
      } catch (error) {
        return {
          channelId,
          videos: [],
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    batchResults.forEach(({ channelId, videos, error }) => {
      if (error) {
        errors.push({ channelId, error });
        console.warn(`Skipping channel ${channelId} due to error:`, error.message);
      } else {
        results.push(...videos);
      }
    });
  }

  // Log summary if there were errors
  if (errors.length > 0) {
    console.warn(
      `Failed to fetch ${errors.length} out of ${channelIds.length} channels`,
      errors
    );
  }

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
      return await fetchChannelRSSFeed(channelId);
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
