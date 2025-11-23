import { describe, it, expect, vi } from 'vitest';
import { resolveWithFallbackApi } from './fallback-api';
import { fetchWithProxy } from './cors-proxies';

// Mock fetchWithProxy
vi.mock('./cors-proxies', () => ({
    fetchWithProxy: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;
const mockFetchWithProxy = fetchWithProxy as ReturnType<typeof vi.fn>;

describe('resolveWithFallbackApi', () => {
    it('should resolve using Piped API when successful', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                items: [{
                    name: 'Test Channel',
                    url: '/channel/UC123456789',
                    thumbnail: 'https://example.com/thumb.jpg'
                }]
            }),
        });

        const result = await resolveWithFallbackApi('testuser');

        expect(result).toEqual({
            id: 'UC123456789',
            title: 'Test Channel',
            thumbnail: 'https://example.com/thumb.jpg'
        });
    });

    it('should return null if all APIs fail', async () => {
        // Mock all fetch calls to fail
        mockFetch.mockRejectedValue(new Error('Network error'));
        mockFetchWithProxy.mockRejectedValue(new Error('Network error'));

        const result = await resolveWithFallbackApi('testuser');
        expect(result).toBeNull();
    }, 10000); // Increase timeout for this test
});
