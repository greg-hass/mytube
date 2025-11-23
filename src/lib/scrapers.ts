import type { YouTubeChannel } from '../types/youtube';
import type { ParsedChannelInput } from './youtube-parser';
import { fetchWithProxy } from './cors-proxies';

/**
 * Fallback function to get basic channel info without API key
 * This creates a minimal channel object when API is not available
 * For handles and custom URLs, we'll use a temporary ID that will be updated later
 */
export async function fetchChannelInfoFallback(
    parsedInput: ParsedChannelInput
): Promise<YouTubeChannel | null> {
    try {
        // For handles and custom URLs, we need to create a temporary placeholder ID
        // This will be updated when RSS feed is fetched
        let channelId: string;
        let title = parsedInput.originalInput;

        if (parsedInput.type === 'channel_id') {
            channelId = parsedInput.value;
            title = `Channel ${parsedInput.value.substring(0, 8)}...`;
        } else if (parsedInput.type === 'handle') {
            // Use the handle as a temporary ID with a prefix to avoid collisions
            channelId = `handle_${parsedInput.value}`;
            title = `@${parsedInput.value}`;
        } else if (parsedInput.type === 'custom_url') {
            // Use the custom URL as a temporary ID with a prefix to avoid collisions
            channelId = `custom_${parsedInput.value}`;
            title = parsedInput.value;
        } else {
            return null;
        }

        // Generate a placeholder thumbnail URL
        const thumbnail = `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random&color=fff`;

        return {
            id: channelId,
            title,
            description: 'Channel information will be updated when videos are fetched',
            thumbnail,
            customUrl: parsedInput.type === 'custom_url' ? parsedInput.value : undefined,
        };
    } catch (error) {
        console.error('Error in fallback channel info fetch:', error);
        return null;
    }
}

/**
 * Scrape the channel page to find the channel ID
 */
export async function scrapeChannelId(searchTerm: string, tempChannelId: string): Promise<{ id: string; title: string; thumbnail?: string } | null> {
    console.log(`🕷️ Attempting to scrape channel ID for ${searchTerm}`);

    try {
        // Construct URL based on type
        const url = tempChannelId.startsWith('handle_')
            ? `https://www.youtube.com/@${searchTerm}`
            : `https://www.youtube.com/${searchTerm}`;

        const html = await fetchWithProxy(url);

        // Extract Channel ID using regex
        // Patterns found in actual YouTube page source:
        // 1. RSS link: href=".../feeds/videos.xml?channel_id=UC..."
        // 2. Canonical URL: href=".../channel/UC..."
        // 3. JSON data: "browseId":"UC..."
        const rssMatch = html.match(/channel_id=(UC[a-zA-Z0-9_-]{22})/);
        const canonicalMatch = html.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
        const browseIdMatch = html.match(/"browseId":"(UC[a-zA-Z0-9_-]{22})"/);

        const channelId = rssMatch?.[1] || canonicalMatch?.[1] || browseIdMatch?.[1];

        if (channelId) {
            console.log(`✅ Scraped Channel ID: ${channelId}`);

            // Try to extract title and thumbnail
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
            const title = titleMatch?.[1] || searchTerm;

            const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
            const thumbnail = imageMatch?.[1] || `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=random&color=fff`;

            return {
                id: channelId,
                title: title,
                thumbnail: thumbnail
            };
        }

        return null;
    } catch (error) {
        console.warn('Scraping failed:', error);
        return null;
    }
}
