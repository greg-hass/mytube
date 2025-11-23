import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchChannelInfo } from './youtube-api';
import { useStore } from '../store/useStore';

// Mock store
vi.mock('../store/useStore', () => ({
    useStore: {
        getState: vi.fn(),
    },
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
