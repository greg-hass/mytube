import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { __test__ } = require('./feed-aggregator');

describe('feed aggregator internals', () => {
    it('refreshes a batch and preserves subscription metadata updates', async () => {
        const subscriptions = [
            { id: 'UC_1', title: 'One', thumbnail: null },
            { id: 'UC_2', title: 'Two', thumbnail: 'https://example.com/thumb.jpg' },
        ];
        const fetchedChannelResults = [];
        const fetchChannelFeed = vi.fn(async (id) => ({
            videos: [{ id: `${id}-video`, channelId: id, publishedAt: '2026-05-31T18:00:00.000Z' }],
            channelMetadata: { title: `${id}-updated`, thumbnail: null },
        }));
        const fetchChannelThumbnail = vi.fn(async (id) => `https://thumb.example/${id}.jpg`);

        const result = await __test__.refreshBatch(
            [{ id: 'UC_1' }, { id: 'UC_2' }],
            subscriptions,
            fetchedChannelResults,
            { fetchChannelFeed, fetchChannelThumbnail }
        );

        expect(fetchChannelFeed).toHaveBeenCalledTimes(2);
        expect(fetchChannelThumbnail).toHaveBeenCalledTimes(1);
        expect(subscriptions[0].title).toBe('UC_1-updated');
        expect(subscriptions[0].thumbnail).toBe('https://thumb.example/UC_1.jpg');
        expect(subscriptions[1].thumbnail).toBe('https://example.com/thumb.jpg');
        expect(fetchedChannelResults).toHaveLength(2);
        expect(result.batchRefreshResults).toHaveLength(2);
        expect(result.batchVideos).toEqual([
            { id: 'UC_1-video', channelId: 'UC_1', publishedAt: '2026-05-31T18:00:00.000Z' },
            { id: 'UC_2-video', channelId: 'UC_2', publishedAt: '2026-05-31T18:00:00.000Z' },
        ]);
    });

    it('updates running aggregation status with an explicit startedAt timestamp', () => {
        __test__.setRunningAggregationStatus({
            skippedChannels: 3,
            subscriptions: [{ id: 'UC_1' }, { id: 'UC_2' }],
            existingVideos: [{ id: 'video-1' }],
            startedAt: '2026-05-31T18:00:00.000Z',
        });

        expect(__test__.getAggregationStatus()).toMatchObject({
            state: 'running',
            current: 3,
            total: 2,
            videos: 1,
            errors: 0,
            startedAt: '2026-05-31T18:00:00.000Z',
            completedAt: null,
        });
    });
});
