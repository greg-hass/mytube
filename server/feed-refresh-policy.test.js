import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    CHANNEL_REFRESH_INTERVAL_MS,
    DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
    getScheduledRefreshConfig,
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

    it('uses a visible scheduled refresh config with safe Docker env overrides', () => {
        expect(getScheduledRefreshConfig({})).toEqual({
            enabled: true,
            refreshOnStartup: true,
            intervalMs: DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
        });

        expect(getScheduledRefreshConfig({
            FEED_REFRESH_ENABLED: 'false',
            FEED_REFRESH_ON_START: 'false',
            FEED_REFRESH_INTERVAL_MINUTES: '30',
        })).toEqual({
            enabled: false,
            refreshOnStartup: false,
            intervalMs: 30 * 60 * 1000,
        });
    });

    it('falls back to the default scheduled refresh interval for invalid values', () => {
        expect(getScheduledRefreshConfig({ FEED_REFRESH_INTERVAL_MINUTES: '0' }).intervalMs)
            .toBe(DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS);
        expect(getScheduledRefreshConfig({ FEED_REFRESH_INTERVAL_MINUTES: 'not-a-number' }).intervalMs)
            .toBe(DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS);
    });
});
