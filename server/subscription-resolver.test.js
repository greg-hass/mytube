import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    applySubscriptionRedirects,
    resolveTemporarySubscriptions,
} = require('./subscription-resolver');

describe('subscription resolver', () => {
    it('applies stored redirects and deduplicates canonical channel IDs', () => {
        const result = applySubscriptionRedirects([
            { id: 'handle_test', title: 'Handle channel', thumbnail: 'handle.jpg' },
            { id: 'UC_CANONICAL', title: 'Canonical channel', thumbnail: 'canonical.jpg' },
        ], {
            handle_test: 'UC_CANONICAL',
        });

        expect(result.changed).toBe(true);
        expect(result.subscriptions).toEqual([
            { id: 'UC_CANONICAL', title: 'Handle channel', thumbnail: 'handle.jpg' },
        ]);
    });

    it('resolves temporary handles with capped API usage and records redirects', async () => {
        const httpClient = {
            get: vi.fn().mockResolvedValue({
                data: {
                    items: [{
                        id: 'UC_REAL_CHANNEL',
                        snippet: {
                            title: 'Resolved Channel',
                            thumbnails: {
                                high: { url: 'https://example.com/high.jpg' },
                            },
                        },
                    }],
                },
            }),
        };
        const redirects = {};

        const result = await resolveTemporarySubscriptions([
            { id: 'handle_test', title: 'Old title', thumbnail: '' },
        ], {
            apiKey: 'test-key',
            redirects,
            resolverQuotaUsed: 0,
            quotaCap: 100,
            httpClient,
        });

        expect(httpClient.get).toHaveBeenCalledWith(expect.stringContaining('forHandle=%40test'));
        expect(result.resolverQuotaUsed).toBe(1);
        expect(redirects).toEqual({ handle_test: 'UC_REAL_CHANNEL' });
        expect(result.subscriptions).toEqual([
            {
                id: 'UC_REAL_CHANNEL',
                title: 'Resolved Channel',
                thumbnail: 'https://example.com/high.jpg',
            },
        ]);
    });
});
