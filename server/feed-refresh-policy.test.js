import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    CHANNEL_REFRESH_INTERVAL_MS,
    DEFAULT_SCHEDULED_REFRESH_INTERVAL_MS,
    getScheduledRefreshConfig,
    getChannelsDueForRefresh,
    mergeChannelRefreshes,
    summarizeFailedChannels,
    startScheduledRefresh,
    stopScheduledRefresh,
    buildVideoFromFeedItem,
    fetchChannelFeed,
    resolveYouTubeShortsStatus,
    enrichVideosWithShortsStatus,
    backfillArchivedShortsStatus,
    applyLocalShortsMetadata,
} = require('./feed-aggregator');

describe('feed refresh policy', () => {
    afterEach(() => {
        vi.useRealTimers();
        stopScheduledRefresh();
    });

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

    it('summarizes failed channel refreshes for status output', () => {
        const failedChannels = summarizeFailedChannels([
            { id: 'UC_OK', title: 'OK', expected: true, videos: [{ id: 'video-1' }], channelMetadata: { title: 'OK' } },
            { id: 'UC_BAD', title: 'Bad Channel', expected: true, videos: [], channelMetadata: null, errorStatus: 404 },
            { id: 'UC_SKIPPED', title: 'Skipped', expected: false, videos: [], channelMetadata: null },
        ]);

        expect(failedChannels).toEqual([
            {
                id: 'UC_BAD',
                title: 'Bad Channel',
                reason: 'RSS feed failed with HTTP 404',
            },
        ]);
    });

    it('retries transient RSS feed failures before returning videos', async () => {
        const feedParser = {
            parseURL: vi.fn()
                .mockRejectedValueOnce(new Error('Status code 500'))
                .mockResolvedValueOnce({
                    title: 'Recovered Channel',
                    items: [
                        {
                            id: 'yt:video:video-1',
                            title: 'Recovered video',
                            pubDate: '2026-05-14T12:00:00.000Z',
                            mediaGroup: {},
                        },
                    ],
                }),
        };

        const result = await fetchChannelFeed('UC_RECOVERED', feedParser, {
            maxAttempts: 2,
            retryDelayMs: 0,
        });

        expect(feedParser.parseURL).toHaveBeenCalledTimes(2);
        expect(result.channelMetadata).toEqual({ title: 'Recovered Channel', thumbnail: null });
        expect(result.videos).toHaveLength(1);
        expect(result.errorStatus).toBeUndefined();
    });

    it('does not retry permanent 404 RSS feed failures', async () => {
        const feedParser = {
            parseURL: vi.fn().mockRejectedValue(new Error('Status code 404')),
        };

        const result = await fetchChannelFeed('UC_MISSING', feedParser, {
            maxAttempts: 3,
            retryDelayMs: 0,
            fallbackToUploadsPage: false,
        });

        expect(feedParser.parseURL).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            videos: [],
            channelMetadata: null,
            errorStatus: 404,
            transient: false,
        });
    });

    it('falls back to the uploads playlist page when RSS returns no feed', async () => {
        const feedParser = {
            parseURL: vi.fn().mockRejectedValue(new Error('Status code 404')),
        };
        const httpClient = {
            get: vi.fn().mockResolvedValue({
                status: 200,
                data: `
                    <script>
                    var ytInitialData = {
                        "metadata": {
                            "playlistMetadataRenderer": {
                                "title": "Fallback Channel - Videos"
                            }
                        },
                        "contents": {
                            "twoColumnBrowseResultsRenderer": {
                                "tabs": [{
                                    "tabRenderer": {
                                        "content": {
                                            "sectionListRenderer": {
                                                "contents": [{
                                                    "itemSectionRenderer": {
                                                        "contents": [{
                                                            "playlistVideoListRenderer": {
                                                                "contents": [{
                                                                    "playlistVideoRenderer": {
                                                                        "videoId": "fallback-video",
                                                                        "title": { "runs": [{ "text": "Fallback video" }] },
                                                                        "thumbnail": { "thumbnails": [{ "url": "https://i.ytimg.com/vi/fallback-video/hqdefault.jpg" }] },
                                                                        "publishedTimeText": { "simpleText": "2 hours ago" }
                                                                    }
                                                                }]
                                                            }
                                                        }]
                                                    }
                                                }]
                                            }
                                        }
                                    }
                                }]
                            }
                        }
                    };
                    </script>
                `,
            }),
        };

        const result = await fetchChannelFeed('UC_FALLBACK', feedParser, {
            maxAttempts: 1,
            httpClient,
            now: Date.parse('2026-05-14T12:00:00.000Z'),
        });

        expect(httpClient.get).toHaveBeenCalledWith(
            'https://www.youtube.com/playlist?list=UU_FALLBACK',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'User-Agent': expect.stringContaining('Mozilla'),
                }),
            })
        );
        expect(result).toMatchObject({
            channelMetadata: { title: 'Fallback Channel', thumbnail: null },
            usedFallback: true,
            videos: [{
                id: 'fallback-video',
                title: 'Fallback video',
                channelId: 'UC_FALLBACK',
                channelTitle: 'Fallback Channel',
                thumbnail: 'https://i.ytimg.com/vi/fallback-video/hqdefault.jpg',
                publishedAt: '2026-05-14T10:00:00.000Z',
            }],
        });
    });

    it('keeps the original RSS failure when the uploads playlist fallback is empty', async () => {
        const feedParser = {
            parseURL: vi.fn().mockRejectedValue(new Error('Status code 404')),
        };
        const httpClient = {
            get: vi.fn().mockResolvedValue({
                status: 200,
                data: '<script>var ytInitialData = {"contents": {}};</script>',
            }),
        };

        const result = await fetchChannelFeed('UC_EMPTY', feedParser, {
            maxAttempts: 1,
            httpClient,
        });

        expect(result).toMatchObject({
            videos: [],
            channelMetadata: null,
            errorStatus: 404,
            transient: false,
        });
    });

    it('maps RSS media descriptions onto cached videos so Shorts hashtags are filterable', () => {
        const video = buildVideoFromFeedItem({
            id: 'yt:video:short-video',
            title: 'Quick clip',
            pubDate: '2026-05-13T12:00:00.000Z',
            mediaGroup: {
                'media:thumbnail': [{ $: { url: 'https://example.com/thumb.jpg' } }],
                'media:description': ['A clipped segment #shorts'],
            },
        }, {
            channelId: 'UC123',
            channelTitle: 'Test Channel',
        });

        expect(video).toMatchObject({
            id: 'short-video',
            title: 'Quick clip',
            channelId: 'UC123',
            channelTitle: 'Test Channel',
            thumbnail: 'https://example.com/thumb.jpg',
            description: 'A clipped segment #shorts',
            duration: null,
            isShort: true,
        });
    });

    it('marks obvious archived Shorts from local metadata without probing YouTube', () => {
        const videos = [
            {
                id: 'tagged-short',
                title: 'Quick clip #shorts',
                description: '',
                duration: null,
            },
            {
                id: 'duration-short',
                title: 'Quick clip',
                description: '',
                duration: 45,
            },
        ];
        const shortsStatusById = {};

        applyLocalShortsMetadata(videos, shortsStatusById);

        expect(shortsStatusById).toEqual({
            'tagged-short': true,
            'duration-short': true,
        });
        expect(videos.every((video) => video.isShort === true)).toBe(true);
    });

    it('does not call YouTube for videos that local metadata already identifies as Shorts', async () => {
        const httpClient = {
            get: vi.fn(),
        };
        const videos = [
            {
                id: 'tagged-short',
                title: 'Quick clip #shorts',
                description: '',
                duration: null,
            },
        ];

        await enrichVideosWithShortsStatus(videos, {}, httpClient);

        expect(httpClient.get).not.toHaveBeenCalled();
        expect(videos[0].isShort).toBe(true);
    });

    it('backfills archived Shorts status in bounded batches', async () => {
        const shortsStatusById = {};
        const videos = Array.from({ length: 300 }, (_, index) => ({
            id: `video-${index}`,
            title: `Video ${index}`,
            description: '',
            duration: null,
        }));

        await backfillArchivedShortsStatus(videos, shortsStatusById, {
            get: vi.fn().mockResolvedValue({
                status: 303,
                headers: { location: 'https://www.youtube.com/watch?v=normal-video' },
            }),
        });

        expect(Object.keys(shortsStatusById)).toHaveLength(250);
        expect(shortsStatusById['video-249']).toBe(false);
        expect(shortsStatusById['video-250']).toBeUndefined();
    });

    it('rechecks cached non-Short statuses so longer Shorts can be corrected', async () => {
        const shortsStatusById = {
            'longer-short': false,
        };
        const videos = [{
            id: 'longer-short',
            title: 'A longer vertical Short',
            description: '',
            duration: 90,
        }];

        await backfillArchivedShortsStatus(videos, shortsStatusById, {
            get: vi.fn().mockResolvedValue({ status: 200, headers: {} }),
        });

        expect(shortsStatusById['longer-short']).toBe(true);
    });

    it('resolves Shorts status from the canonical YouTube Shorts URL', async () => {
        await expect(resolveYouTubeShortsStatus('short-video', {
            get: vi.fn().mockResolvedValue({ status: 200, headers: {} }),
        })).resolves.toBe(true);

        await expect(resolveYouTubeShortsStatus('normal-video', {
            get: vi.fn().mockResolvedValue({
                status: 303,
                headers: { location: 'https://www.youtube.com/watch?v=normal-video' },
            }),
        })).resolves.toBe(false);
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

    it('forces scheduled refreshes so every subscribed channel is checked every interval', async () => {
        vi.useFakeTimers();
        const aggregateFeeds = vi.fn().mockResolvedValue(undefined);

        startScheduledRefresh({
            enabled: true,
            refreshOnStartup: true,
            intervalMs: 100,
        }, { aggregateFeeds });

        await vi.advanceTimersByTimeAsync(100);

        expect(aggregateFeeds).toHaveBeenCalledWith({ force: true, reason: 'scheduled' });
    });

    it('does not start a second scheduled refresh while the previous one is still running', async () => {
        vi.useFakeTimers();
        let finishRefresh;
        const aggregateFeeds = vi.fn(() => new Promise(resolve => {
            finishRefresh = resolve;
        }));

        startScheduledRefresh({
            enabled: true,
            refreshOnStartup: true,
            intervalMs: 100,
        }, { aggregateFeeds });

        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(100);

        expect(aggregateFeeds).toHaveBeenCalledTimes(1);

        finishRefresh();
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(100);

        expect(aggregateFeeds).toHaveBeenCalledTimes(2);
    });
});
