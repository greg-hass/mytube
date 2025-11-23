import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrapeChannelId } from './scrapers';
import { fetchWithProxy } from './cors-proxies';

// Mock fetchWithProxy
vi.mock('./cors-proxies', () => ({
    fetchWithProxy: vi.fn(),
}));

const mockFetchWithProxy = fetchWithProxy as ReturnType<typeof vi.fn>;

describe('scrapeChannelId', () => {
    beforeEach(() => {
        mockFetchWithProxy.mockReset();
    });

    it('should successfully scrape channel ID from RSS feed link', async () => {
        const mockHtml = `
      <html>
        <head>
          <link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890abcdefghijkl" />
          <meta property="og:title" content="Test Channel" />
          <meta property="og:image" content="https://example.com/thumb.jpg" />
        </head>
        <body></body>
      </html>
    `;

        mockFetchWithProxy.mockResolvedValueOnce(mockHtml);

        const result = await scrapeChannelId('someuser', 'handle_someuser');

        expect(result).toEqual({
            id: 'UC1234567890abcdefghijkl',
            title: 'Test Channel',
            thumbnail: 'https://example.com/thumb.jpg'
        });
    });

    it('should return null if no channel ID patterns found', async () => {
        const mockHtml = `
      <html>
        <head>
          <title>Some User - YouTube</title>
        </head>
        <body></body>
      </html>
    `;

        mockFetchWithProxy.mockResolvedValueOnce(mockHtml);

        const result = await scrapeChannelId('someuser', 'handle_someuser');
        expect(result).toBeNull();
    });

    it('should return null if fetch fails', async () => {
        mockFetchWithProxy.mockRejectedValueOnce(new Error('Fetch failed'));

        const result = await scrapeChannelId('nonexistent', 'handle_nonexistent');
        expect(result).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
        mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

        const result = await scrapeChannelId('someuser', 'handle_someuser');
        expect(result).toBeNull();
    });
});
