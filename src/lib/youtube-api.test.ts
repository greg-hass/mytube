import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchChannelIconsBatch, fetchChannelInfo, resolveTemporaryChannelFromRSS } from './youtube-api';
import { useStore } from '../store/useStore';

// Mock store
vi.mock('../store/useStore', () => ({
    useStore: {
        getState: vi.fn(),
    },
}));

vi.mock('./scrapers', () => ({
    scrapeChannelId: vi.fn(() => Promise.resolve(null)),
    fetchChannelInfoFallback: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./fallback-api', () => ({
    resolveWithFallbackApi: vi.fn(() => Promise.resolve(null)),
}));

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

describe('fetchChannelInfo', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        vi.clearAllMocks();
    });

    it('should throw error if API is disabled in settings', async () => {
        (useStore.getState as any).mockReturnValue({ useApiForVideos: false });

        const result = await fetchChannelInfo(
            { type: 'channel_id', value: 'UC123', originalInput: 'UC123' },
            'fake-key'
        );

        expect(result).toBeNull();
    });

    it('should fetch channel info if API is enabled', async () => {
        (useStore.getState as any).mockReturnValue({
            useApiForVideos: true,
            incrementQuota: vi.fn()
        });

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                items: [{
                    id: 'UC123',
                    snippet: {
                        title: 'Test Channel',
                        description: 'Desc',
                        thumbnails: { high: { url: 'thumb.jpg' } },
                        customUrl: '@test'
                    },
                    statistics: {
                        subscriberCount: '100',
                        videoCount: '10'
                    }
                }]
            })
        });

        const result = await fetchChannelInfo(
            { type: 'channel_id', value: 'UC123', originalInput: 'UC123' },
            'fake-key'
        );

        expect(result).toEqual({
            id: 'UC123',
            title: 'Test Channel',
            description: 'Desc',
            thumbnail: 'thumb.jpg',
            customUrl: '@test',
            subscriberCount: '100',
            videoCount: '10'
        });
    });
});

describe('resolveTemporaryChannelFromRSS', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        vi.clearAllMocks();
    });

    it('uses a capped automatic API resolver for handles without requiring enhanced fetching', async () => {
        const incrementQuota = vi.fn();
        (useStore.getState as any).mockReturnValue({
            apiKey: 'fake-key',
            useApiForVideos: false,
            quotaUsed: 0,
            incrementQuota,
        });

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                items: [{
                    id: 'UC123',
                    snippet: {
                        title: 'Test Channel',
                        thumbnails: { high: { url: 'thumb.jpg' } },
                    },
                }],
            }),
        });

        const result = await resolveTemporaryChannelFromRSS('handle_test', 'fake-key');

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(incrementQuota).toHaveBeenCalledWith(1);
        expect(result).toEqual({
            id: 'UC123',
            title: 'Test Channel',
            thumbnail: 'thumb.jpg',
        });
    });

    it('does not call YouTube API when the automatic resolver quota cap is reached', async () => {
        (useStore.getState as any).mockReturnValue({
            apiKey: 'fake-key',
            useApiForVideos: false,
            quotaUsed: 100,
            incrementQuota: vi.fn(),
        });

        mockFetch.mockRejectedValue(new Error('should not call fetch'));

        await resolveTemporaryChannelFromRSS('handle_test', 'fake-key');

        expect(mockFetch).not.toHaveBeenCalled();
    });
});

describe('fetchChannelIconsBatch', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        vi.clearAllMocks();
    });

    it('fetches channel thumbnails even when video API fetching is disabled', async () => {
        const incrementQuota = vi.fn();
        (useStore.getState as any).mockReturnValue({
            useApiForVideos: false,
            incrementQuota,
        });

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                items: [{
                    id: 'UC123',
                    snippet: {
                        title: 'Test Channel',
                        description: 'Desc',
                        thumbnails: { high: { url: 'thumb.jpg' } },
                        customUrl: '@test',
                    },
                }],
            }),
        });

        const result = await fetchChannelIconsBatch(['UC123'], 'fake-key');

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(String(mockFetch.mock.calls[0][0])).toContain('part=snippet');
        expect(String(mockFetch.mock.calls[0][0])).not.toContain('statistics');
        expect(incrementQuota).toHaveBeenCalledWith(1);
        expect(result).toEqual([{
            id: 'UC123',
            title: 'Test Channel',
            description: 'Desc',
            thumbnail: 'thumb.jpg',
            customUrl: '@test',
        }]);
    });

    it('batches channel icon repair requests in groups of 50', async () => {
        const incrementQuota = vi.fn();
        (useStore.getState as any).mockReturnValue({
            useApiForVideos: false,
            incrementQuota,
        });

        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ items: [] }),
        });

        await fetchChannelIconsBatch(
            Array.from({ length: 51 }, (_, index) => `UC${index}`),
            'fake-key'
        );

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(incrementQuota).toHaveBeenCalledTimes(2);
    });
});
