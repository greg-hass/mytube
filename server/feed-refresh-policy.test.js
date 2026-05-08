import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    CHANNEL_REFRESH_INTERVAL_MS,
    getChannelsDueForRefresh,
    mergeChannelRefreshes,
} = require('./feed-aggregator');

describe('feed refresh policy', () => {
    it('only refreshes channels whose RSS cache is due during automatic runs', () => {
        const now = Date.parse('2026-05-06T20:00:00.000Z');
        const subscriptions = [
            { id: 'UC_FRESH' },
            { id: 'UC_DUE' },
            { id: 'UC_NEW' },
        ];
        const channelRefreshes = {
            UC_FRESH: { lastFetchedAt: new Date(now - CHANNEL_REFRESH_INTERVAL_MS + 1000).toISOString() },
            UC_DUE: { lastFetchedAt: new Date(now - CHANNEL_REFRESH_INTERVAL_MS - 1000).toISOString() },
        };

        const due = getChannelsDueForRefresh(subscriptions, channelRefreshes, {
            now,
            force: false,
        });

        expect(due.map(channel => channel.id)).toEqual(['UC_DUE', 'UC_NEW']);
    });

    it('refreshes every channel when the user manually forces a refresh', () => {
        const now = Date.parse('2026-05-06T20:00:00.000Z');
        const subscriptions = [
            { id: 'UC_FRESH' },
            { id: 'UC_DUE' },
        ];
        const channelRefreshes = {
            UC_FRESH: { lastFetchedAt: new Date(now).toISOString() },
            UC_DUE: { lastFetchedAt: new Date(now).toISOString() },
        };

        const due = getChannelsDueForRefresh(subscriptions, channelRefreshes, {
            now,
            force: true,
        });

        expect(due.map(channel => channel.id)).toEqual(['UC_FRESH', 'UC_DUE']);
    });

    it('keeps refresh metadata only for subscribed channels and updates fetched channels', () => {
        const merged = mergeChannelRefreshes(
            {
                UC_KEEP: { lastFetchedAt: '2026-05-06T18:00:00.000Z' },
                UC_REMOVED: { lastFetchedAt: '2026-05-06T18:00:00.000Z' },
            },
            new Set(['UC_KEEP', 'UC_NEW']),
            [{ id: 'UC_NEW' }],
            '2026-05-06T20:00:00.000Z'
        );

        expect(merged).toEqual({
            UC_KEEP: { lastFetchedAt: '2026-05-06T18:00:00.000Z' },
            UC_NEW: { lastFetchedAt: '2026-05-06T20:00:00.000Z' },
        });
    });
});
