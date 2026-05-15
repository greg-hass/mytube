import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildVideoFromFeedItem, parseUploadsPlaylistVideos } = require('./feed-fetcher');

function buildUploadsPage(videoRenderers) {
    return `
        <script>
        var ytInitialData = {
            "metadata": {
                "playlistMetadataRenderer": {
                    "title": "Fallback Channel - Videos"
                }
            },
            "contents": {
                "playlistVideoListRenderer": {
                    "contents": ${JSON.stringify(videoRenderers)}
                }
            }
        };
        </script>
    `;
}

describe('feed fetcher', () => {
    it('stores portrait thumbnail URLs for feed items that are Shorts', () => {
        const video = buildVideoFromFeedItem({
            id: 'yt:video:short-id',
            title: 'Quick clip #shorts',
            pubDate: '2026-05-14T10:00:00.000Z',
            mediaGroup: {
                'media:thumbnail': {
                    $: { url: 'https://i.ytimg.com/vi/short-id/hqdefault.jpg' },
                },
            },
        }, {
            channelId: 'UC_FALLBACK',
            channelTitle: 'Fallback Channel',
        });

        expect(video).toMatchObject({
            id: 'short-id',
            isShort: true,
            thumbnail: 'https://i.ytimg.com/vi/short-id/oar2.jpg',
        });
    });

    it('does not treat missing uploads-page publish times as newly published videos', () => {
        const html = buildUploadsPage([
            {
                playlistVideoRenderer: {
                    videoId: 'real-date',
                    title: { runs: [{ text: 'Video with a real age' }] },
                    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/real-date/hqdefault.jpg' }] },
                    publishedTimeText: { simpleText: '2 hours ago' },
                },
            },
            {
                playlistVideoRenderer: {
                    videoId: 'missing-date',
                    title: { runs: [{ text: 'Video missing age text' }] },
                    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/missing-date/hqdefault.jpg' }] },
                },
            },
            {
                playlistVideoRenderer: {
                    videoId: 'bad-date',
                    title: { runs: [{ text: 'Video with bad age text' }] },
                    thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/bad-date/hqdefault.jpg' }] },
                    publishedTimeText: { simpleText: 'Watch now' },
                },
            },
        ]);

        const { videos } = parseUploadsPlaylistVideos(html, {
            channelId: 'UC_FALLBACK',
            now: Date.parse('2026-05-14T12:00:00.000Z'),
        });

        expect(videos).toHaveLength(1);
        expect(videos[0]).toMatchObject({
            id: 'real-date',
            publishedAt: '2026-05-14T10:00:00.000Z',
            thumbnail: 'https://i.ytimg.com/vi/real-date/maxresdefault.jpg',
            publishedAtSource: 'youtube-relative-time',
        });
    });
});
