import type { YouTubeChannel } from '../types/youtube';
import type { ParsedChannelInput } from './youtube-parser';
import { useStore } from '../store/useStore';
import { scrapeChannelId, fetchChannelInfoFallback } from './scrapers';
import { resolveWithFallbackApi } from './fallback-api';
import { handleError } from './error-handler';

// Re-export fetchChannelInfoFallback for backward compatibility if needed
export { fetchChannelInfoFallback };

/**
 * YouTube API configuration
 * Note: This application uses RSS feeds for video fetching, but needs API access
 * for resolving handles and custom URLs to channel IDs
 */
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Fetch channel information from YouTube API
 * This function handles different input types and resolves them to channel details
 */
export async function fetchChannelInfo(
  parsedInput: ParsedChannelInput,
  apiKey: string
): Promise<YouTubeChannel | null> {
  try {
    let channelId: string;
    const useApi = useStore.getState().useApiForVideos;

    // If API is disabled, throw error to trigger fallback immediately
    if (!useApi) {
      throw new Error('API is disabled in settings');
    }

    // If we already have a channel ID, fetch directly
    if (parsedInput.type === 'channel_id') {
      channelId = parsedInput.value;
    } else {
      // For handles and custom URLs, we need to resolve to channel ID first
      const resolvedChannelId = await resolveChannelId(parsedInput, apiKey);
      if (!resolvedChannelId) {
        throw new Error('Could not resolve channel ID');
      }
      channelId = resolvedChannelId;
    }

    // Fetch channel details using the channel ID
    const response = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`
    );
    useStore.getState().incrementQuota(1);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      throw new Error('Channel not found');
    }

    const channel = data.items[0];
    return {
      id: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnail: channel.snippet.thumbnails.high?.url || channel.snippet.thumbnails.medium?.url || channel.snippet.thumbnails.default?.url,
      customUrl: channel.snippet.customUrl,
      subscriberCount: channel.statistics.subscriberCount,
      videoCount: channel.statistics.videoCount,
    };
  } catch (error) {
    handleError(error, { context: 'Fetching channel info', showToast: false });
    return null;
  }
}

/**
 * Fetch details for multiple channels in a single batch request
 * This is much more efficient than fetching one by one
 */
export async function fetchChannelsBatch(
  channelIds: string[],
  apiKey: string
): Promise<YouTubeChannel[]> {
  if (channelIds.length === 0) return [];

  // Check if API is enabled
  const useApi = useStore.getState().useApiForVideos;
  if (!useApi) {
    return [];
  }

  try {
    // YouTube API allows up to 50 IDs per request
    const batches = [];
    for (let i = 0; i < channelIds.length; i += 50) {
      batches.push(channelIds.slice(i, i + 50));
    }

    const results: YouTubeChannel[] = [];

    for (const batch of batches) {
      const ids = batch.join(',');
      const response = await fetch(
        `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${ids}&key=${apiKey}`
      );
      useStore.getState().incrementQuota(1);

      if (!response.ok) {
        console.error(`Batch fetch failed: ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.items) {
        const channels = data.items.map((channel: any) => ({
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnail: channel.snippet.thumbnails.high?.url || channel.snippet.thumbnails.medium?.url || channel.snippet.thumbnails.default?.url,
          customUrl: channel.snippet.customUrl,
          subscriberCount: channel.statistics.subscriberCount,
          videoCount: channel.statistics.videoCount,
        }));
        results.push(...channels);
      }
    }

    return results;
  } catch (error) {
    console.error('Error in batch channel fetch:', error);
    return [];
  }
}

/**
 * Fetch latest videos for a list of channels using the YouTube Data API
 * This bypasses RSS limitations and provides more reliable data
 */
export async function fetchVideosForChannelsAPI(
  channelIds: string[],
  apiKey: string
): Promise<import('../types/youtube').YouTubeVideo[]> {
  if (channelIds.length === 0) return [];

  // Check if API is enabled
  const useApi = useStore.getState().useApiForVideos;
  if (!useApi) {
    return [];
  }

  // We can't batch fetch videos from different playlists in one request
  // So we have to make parallel requests for each channel
  // We'll limit concurrency to avoid hitting rate limits too hard

  const results: import('../types/youtube').YouTubeVideo[] = [];

  // Process channels with controlled concurrency (10 at a time)
  // This balances speed with browser connection limits and API rate limits
  const CONCURRENCY_LIMIT = 10;

  for (let i = 0; i < channelIds.length; i += CONCURRENCY_LIMIT) {
    const batch = channelIds.slice(i, i + CONCURRENCY_LIMIT);

    const promises = batch.map(async (channelId) => {
      try {
        // Construct uploads playlist ID (replace UC with UU)
        // This is a standard YouTube pattern that saves us an API call to look up the ID
        const playlistId = channelId.startsWith('UC')
          ? 'UU' + channelId.substring(2)
          : channelId; // Fallback if it doesn't start with UC (unlikely for valid IDs)

        const response = await fetch(
          `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=10&key=${apiKey}`
        );
        useStore.getState().incrementQuota(1);

        if (!response.ok) {
          // If 404, the channel might not have any videos or the UU trick didn't work
          // We'll just ignore it for now to keep things moving
          return [];
        }

        const data = await response.json();

        if (!data.items) return [];

        return data.items.map((item: any) => ({
          id: item.contentDetails.videoId,
          title: item.snippet.title,
          channelId: item.snippet.channelId,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
          description: item.snippet.description,
        }));
      } catch (error) {
        console.error(`Error fetching videos for channel ${channelId}:`, error);
        return [];
      }
    });

    const videosArrays = await Promise.all(promises);

    // Flatten results from this batch
    videosArrays.forEach(videos => {
      results.push(...videos);
    });
  }

  return results;
}

/**
 * Resolve handle or custom URL to channel ID
 */
async function resolveChannelId(
  parsedInput: ParsedChannelInput,
  apiKey: string
): Promise<string | null> {
  try {
    const useApi = useStore.getState().useApiForVideos;
    if (!useApi) {
      console.log('API disabled, skipping handle resolution via API');
      return null;
    }

    if (parsedInput.type === 'handle') {
      // Use the channels endpoint with forHandle parameter (more reliable than search)
      // Remove @ prefix if present
      const handleValue = parsedInput.value.startsWith('@')
        ? parsedInput.value.substring(1)
        : parsedInput.value;

      console.log('Resolving handle:', handleValue);

      const response = await fetch(
        `${YOUTUBE_API_BASE}/channels?part=snippet&forHandle=${encodeURIComponent(handleValue)}&key=${apiKey}`
      );
      useStore.getState().incrementQuota(1);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Handle resolution failed:', response.status, errorText);
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Handle resolution response:', data);

      if (!data.items || data.items.length === 0) {
        console.warn('No channel found for handle:', handleValue);
        return null;
      }

      const channel = data.items[0];
      console.log('Resolved channel ID:', channel.id);
      return channel.id;
    } else if (parsedInput.type === 'custom_url') {
      // Search by custom URL or channel name
      const response = await fetch(
        `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(parsedInput.value)}&type=channel&maxResults=5&key=${apiKey}`
      );
      useStore.getState().incrementQuota(100);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return null;
      }

      // Find the best match among search results
      for (const item of data.items) {
        const channelId = item.snippet.channelId;

        // Fetch full channel details to check customUrl
        const channelResponse = await fetch(
          `${YOUTUBE_API_BASE}/channels?part=snippet&id=${channelId}&key=${apiKey}`
        );

        if (channelResponse.ok) {
          const channelData = await channelResponse.json();
          if (channelData.items && channelData.items.length > 0) {
            const channel = channelData.items[0];

            // Check for exact match with customUrl
            if (channel.snippet.customUrl === parsedInput.value) {
              return channelId;
            }

            // Check for exact match with title
            if (channel.snippet.title.toLowerCase() === parsedInput.value.toLowerCase()) {
              return channelId;
            }
          }
        }
      }

      return null;
    }

    return null;
  } catch (error) {
    console.error('Error resolving channel ID:', error);
    return null;
  }
}

/**
 * Try to fetch channel info with API first, then fallback to HTML parsing
 */
export async function fetchChannelInfoWithFallback(
  parsedInput: ParsedChannelInput,
  apiKey?: string
): Promise<YouTubeChannel | null> {
  if (apiKey) {
    try {
      const result = await fetchChannelInfo(parsedInput, apiKey);
      if (result) return result;
    } catch (error) {
      console.warn('API fetch failed, falling back to local parsing:', error);
    }
  }

  // Fallback to HTML parsing
  return fetchChannelInfoFallback(parsedInput);
}

/**
 * Try to resolve temporary channel ID to proper channel ID from RSS feed
 */
export async function resolveTemporaryChannelFromRSS(
  tempChannelId: string,
  apiKey?: string
): Promise<{
  id: string;
  title: string;
  thumbnail?: string;
} | null> {
  // Only handle temporary IDs
  if (!tempChannelId.startsWith('handle_') && !tempChannelId.startsWith('custom_')) {
    return null;
  }

  const searchTerm = tempChannelId.replace(/^(handle_|custom_)/, '');
  console.log(`🔍 Attempting to resolve temporary channel: ${tempChannelId} -> ${searchTerm}`);

  try {
    // Use provided key, or get from store, or fallback to env
    const { apiKey: storeApiKey, useApiForVideos } = useStore.getState();

    // Only use API key if useApiForVideos is true
    const effectiveApiKey = (useApiForVideos) ? (apiKey || storeApiKey || import.meta.env.VITE_YOUTUBE_API_KEY) : null;

    console.log(`🔑 Resolution API Key available: ${!!effectiveApiKey}`);

    if (effectiveApiKey) {
      try {
        if (tempChannelId.startsWith('handle_')) {
          // Resolve using channels endpoint with forHandle
          // Ensure @ prefix is present for the API call
          const handleForApi = searchTerm.startsWith('@') ? searchTerm : `@${searchTerm}`;
          console.log(`🔍 Fetching handle: ${handleForApi}`);
          const response = await fetch(`${YOUTUBE_API_BASE}/channels?part=snippet&forHandle=${encodeURIComponent(handleForApi)}&key=${effectiveApiKey}`);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('YouTube API Error Details:', JSON.stringify(errorData, null, 2));
            throw new Error(`Handle resolution failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
          }
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            const channel = data.items[0];
            return {
              id: channel.id,
              title: channel.snippet.title,
              thumbnail: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url
            };
          }
        } else {
          // Resolve custom URL via search similar to resolveChannelId logic
          const response = await fetch(`${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(searchTerm)}&type=channel&maxResults=5&key=${effectiveApiKey}`);
          if (!response.ok) {
            throw new Error(`Custom URL search failed: ${response.status}`);
          }
          const data = await response.json();
          if (data.items && data.items.length > 0) {
            const channelId = data.items[0].snippet.channelId;
            // Fetch channel details for title and thumbnail
            const channelResp = await fetch(`${YOUTUBE_API_BASE}/channels?part=snippet&id=${channelId}&key=${effectiveApiKey}`);
            if (channelResp.ok) {
              const chData = await channelResp.json();
              if (chData.items && chData.items.length > 0) {
                const ch = chData.items[0];
                return {
                  id: ch.id,
                  title: ch.snippet.title,
                  thumbnail: ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url
                };
              }
            }
            // Fallback if details fetch fails
            return { id: channelId, title: searchTerm, thumbnail: undefined };
          }
        }
      } catch (apiError) {
        console.warn('API resolution failed, falling back to scraping:', apiError);
        // Intentional fallthrough to scraping logic below
      }
    }

    // Fallback: Scrape the channel page if API key is missing or API call failed/returned no results
    const scrapedResult = await scrapeChannelId(searchTerm, tempChannelId);
    if (scrapedResult) {
      return scrapedResult;
    }

    console.warn('❌ Failed to scrape channel ID, trying Invidious/Piped fallback...');

    // Fallback: Try Invidious API as a last resort
    const invidiousResult = await resolveWithFallbackApi(searchTerm);
    if (invidiousResult) {
      return invidiousResult;
    }

    // If resolution fails, fallback to placeholder
    return {
      id: tempChannelId,
      title: searchTerm,
      thumbnail: `https://ui-avatars.com/api/?name=${encodeURIComponent(searchTerm)}&background=random&color=fff`
    };
  } catch (error) {
    console.warn('Failed to resolve temporary channel, trying Invidious/Piped fallback:', error);

    // Try Invidious/Piped one last time if everything else crashed
    try {
      const invidiousPipedResult = await resolveWithFallbackApi(searchTerm);
      if (invidiousPipedResult) return invidiousPipedResult;
    } catch (e) {
      console.warn('Invidious/Piped fallback also failed:', e);
    }

    return null;
  }
}
