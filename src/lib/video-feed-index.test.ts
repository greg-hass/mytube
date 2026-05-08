import { describe, expect, it } from 'vitest';
import { buildVideoFeedIndex, filterIndexedVideos } from './video-feed-index';
import type { YouTubeChannel, YouTubeVideo } from '../types/youtube';

const videos: YouTubeVideo[] = [
  {
    id: 'normal',
    title: 'Linux weekly roundup',
    description: '',
    thumbnail: '',
    channelId: 'tech',
    channelTitle: 'Tech Channel',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'channel-match',
    title: 'Security bulletin',
    description: '',
    thumbnail: '',
    channelId: 'linux-news',
    channelTitle: 'Linux News',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'short',
    title: 'Breaking update AJ#shorts',
    description: '',
    thumbnail: '',
    channelId: 'news',
    channelTitle: 'News Channel',
    publishedAt: new Date().toISOString(),
  },
  {
    id: 'muted',
    title: 'Muted upload',
    description: '',
    thumbnail: '',
    channelId: 'muted-channel',
    channelTitle: 'Muted Channel',
    publishedAt: new Date().toISOString(),
  },
];

const channels: YouTubeChannel[] = [
  {
    id: 'muted-channel',
    title: 'Muted Channel',
    description: '',
    thumbnail: '',
    isMuted: true,
  },
];

describe('video feed index', () => {
  it('precomputes searchable text and shorts metadata once per video', () => {
    const index = buildVideoFeedIndex(videos, channels);

    expect(index.videosById.get('normal')?.searchText).toContain('linux weekly roundup');
    expect(index.videosById.get('channel-match')?.searchText).toContain('linux news');
    expect(index.videosById.get('short')?.isShort).toBe(true);
    expect(index.mutedChannelIds.has('muted-channel')).toBe(true);
  });

  it('filters with the precomputed index', () => {
    const index = buildVideoFeedIndex(videos, channels);

    expect(filterIndexedVideos(index, { searchQuery: 'linux', showShorts: true }).map(item => item.video.id))
      .toEqual(['normal', 'channel-match']);
    expect(filterIndexedVideos(index, { searchQuery: '', showShorts: false }).map(item => item.video.id))
      .toEqual(['normal', 'channel-match']);
  });
});
