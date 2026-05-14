import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { mergeVideoArchive } = require('./video-archive');

describe('mergeVideoArchive', () => {
    it('preserves older cached videos while adding newly fetched RSS videos', () => {
        const existingVideos = [
            {
                id: 'older-video',
                title: 'Older cached video',
                channelId: 'UC1',
                channelTitle: 'Channel One',
                publishedAt: '2026-04-01T10:00:00.000Z',
                thumbnail: 'older.jpg',
                description: '',
            },
        ];
        const fetchedVideos = [
            {
                id: 'new-video',
                title: 'New RSS video',
                channelId: 'UC1',
                channelTitle: 'Channel One',
                publishedAt: '2026-05-04T10:00:00.000Z',
                thumbnail: 'new.jpg',
                description: '',
            },
        ];

        const merged = mergeVideoArchive(existingVideos, fetchedVideos, {
            activeChannelIds: new Set(['UC1']),
            maxVideos: 10,
        });

        expect(merged.map(video => video.id)).toEqual(['new-video', 'older-video']);
    });

    it('drops archived videos for channels that are no longer subscribed', () => {
        const merged = mergeVideoArchive(
            [
                {
                    id: 'removed-channel-video',
                    title: 'Should disappear',
                    channelId: 'UC_REMOVED',
                    channelTitle: 'Removed',
                    publishedAt: '2026-05-01T10:00:00.000Z',
                    thumbnail: 'removed.jpg',
                    description: '',
                },
            ],
            [],
            {
                activeChannelIds: new Set(['UC_ACTIVE']),
                maxVideos: 10,
            }
        );

        expect(merged).toEqual([]);
    });

    it('keeps the original publish time when uploads fallback re-finds an archived video', () => {
        const merged = mergeVideoArchive(
            [
                {
                    id: 'existing-video',
                    title: 'Existing title',
                    channelId: 'UC1',
                    channelTitle: 'Channel One',
                    publishedAt: '2026-05-01T10:00:00.000Z',
                    thumbnail: 'old.jpg',
                    description: 'Existing description',
                },
            ],
            [
                {
                    id: 'existing-video',
                    title: 'Fallback title',
                    channelId: 'UC1',
                    channelTitle: 'Channel One',
                    publishedAt: '2026-05-14T12:00:00.000Z',
                    thumbnail: 'new.jpg',
                    description: '',
                    fetchedVia: 'youtube-page-fallback',
                },
            ],
            {
                activeChannelIds: new Set(['UC1']),
                maxVideos: 10,
            }
        );

        expect(merged[0]).toMatchObject({
            id: 'existing-video',
            title: 'Fallback title',
            publishedAt: '2026-05-01T10:00:00.000Z',
            thumbnail: 'new.jpg',
            description: 'Existing description',
        });
    });
});
