import { describe, expect, it } from 'vitest';
import { buildVideoFeedIndex, filterIndexedVideos, isShortVideo } from './video-feed-index';
import type { YouTubeChannel, YouTubeVideo } from '../types/youtube';

const FIXED_PUBLISHED_AT = '2026-05-14T12:00:00.000Z';

const videos: YouTubeVideo[] = [
  {
    id: 'normal',
    title: 'Linux weekly roundup',
    description: '',
    thumbnail: '',
    channelId: 'tech',
    channelTitle: 'Tech Channel',
    publishedAt: FIXED_PUBLISHED_AT,
    duration: 20 * 60,
  },
  {
    id: 'channel-match',
    title: 'Security bulletin',
    description: '',
    thumbnail: '',
    channelId: 'linux-news',
    channelTitle: 'Linux News',
    publishedAt: FIXED_PUBLISHED_AT,
    duration: 8 * 60,
  },
  {
    id: 'short',
    title: 'Breaking update AJ#shorts',
    description: '',
    thumbnail: '',
    channelId: 'news',
    channelTitle: 'News Channel',
    publishedAt: FIXED_PUBLISHED_AT,
    duration: 30,
  },
  {
    id: 'muted',
    title: 'Muted upload',
    description: '',
    thumbnail: '',
    channelId: 'muted-channel',
    channelTitle: 'Muted Channel',
    publishedAt: FIXED_PUBLISHED_AT,
    duration: 15 * 60,
  },
  {
    id: 'live-replay',
    title: 'Match reaction livestream replay',
    description: '',
    thumbnail: '',
    channelId: 'football',
    channelTitle: 'Football Channel',
    publishedAt: FIXED_PUBLISHED_AT,
    duration: 2 * 60 * 60,
  },
  {
    id: 'premiere',
    title: 'Product documentary premiere',
    description: '',
    thumbnail: '',
    channelId: 'tech',
    channelTitle: 'Tech Channel',
    publishedAt: FIXED_PUBLISHED_AT,
    duration: 45 * 60,
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
    expect(index.videosById.get('short')?.video.isShort).toBe(true);
    expect(index.mutedChannelIds.has('muted-channel')).toBe(true);
  });

  it('orders indexed videos newest first even when the server payload is grouped by refresh order', () => {
    const index = buildVideoFeedIndex([
      {
        id: 'older',
        title: 'Older upload',
        description: '',
        thumbnail: '',
        channelId: 'channel-a',
        channelTitle: 'Channel A',
        publishedAt: '2026-05-14T10:00:00.000Z',
      },
      {
        id: 'newer',
        title: 'Newer upload',
        description: '',
        thumbnail: '',
        channelId: 'channel-b',
        channelTitle: 'Channel B',
        publishedAt: '2026-05-14T12:00:00.000Z',
      },
      {
        id: 'invalid-date',
        title: 'Missing date',
        description: '',
        thumbnail: '',
        channelId: 'channel-c',
        channelTitle: 'Channel C',
        publishedAt: '',
      },
    ], []);

    expect(filterIndexedVideos(index, { searchQuery: '', showShorts: true }).map(item => item.video.id))
      .toEqual(['newer', 'older', 'invalid-date']);
  });

  it('trusts explicit Shorts metadata even when duration and text are missing', () => {
    expect(isShortVideo({
      title: 'Quick football clip',
      description: '',
      isShort: true,
    })).toBe(true);

    expect(isShortVideo({
      title: 'Quick football clip #shorts',
      description: '',
      isShort: false,
    })).toBe(false);
  });

  it('treats square and vertical videos up to three minutes as Shorts when dimensions are known', () => {
    expect(isShortVideo({
      title: 'Vertical quick explainer',
      description: '',
      duration: 179,
      videoWidth: 1080,
      videoHeight: 1920,
    })).toBe(true);

    expect(isShortVideo({
      title: 'Square quick explainer',
      description: '',
      duration: 180,
      videoWidth: 1080,
      videoHeight: 1080,
    })).toBe(true);

    expect(isShortVideo({
      title: 'Horizontal quick explainer',
      description: '',
      duration: 179,
      videoWidth: 1920,
      videoHeight: 1080,
    })).toBe(false);
  });

  it('keeps the legacy one-minute Shorts cutoff when dimensions are missing', () => {
    expect(isShortVideo({
      title: 'Unlabelled short upload',
      description: '',
      duration: 60,
    })).toBe(true);

    expect(isShortVideo({
      title: 'Unlabelled two minute upload',
      description: '',
      duration: 120,
    })).toBe(false);
  });

  it('filters with the precomputed index', () => {
    const index = buildVideoFeedIndex(videos, channels);

    expect(filterIndexedVideos(index, { searchQuery: 'linux', showShorts: true }).map(item => item.video.id))
      .toEqual(['normal', 'channel-match']);
    expect(filterIndexedVideos(index, { searchQuery: '', showShorts: false }).map(item => item.video.id))
      .toEqual(['normal', 'channel-match', 'live-replay', 'premiere']);
  });

  it('filters videos by duration ranges', () => {
    const index = buildVideoFeedIndex(videos, channels);

    expect(filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      durationFilter: 'under-10',
    }).map(item => item.video.id)).toEqual(['channel-match', 'short']);

    expect(filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      durationFilter: '10-30',
    }).map(item => item.video.id)).toEqual(['normal']);

    expect(filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      durationFilter: '30-plus',
    }).map(item => item.video.id)).toEqual(['live-replay', 'premiere']);
  });

  it('can hide livestreams and replays from the feed', () => {
    const index = buildVideoFeedIndex(videos, channels);

    const filteredIds = filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      hideLiveReplays: true,
    }).map(item => item.video.id);

    expect(filteredIds).not.toContain('live-replay');
    expect(filteredIds).toContain('premiere');
  });

  it('can hide premieres separately from livestream replays', () => {
    const index = buildVideoFeedIndex(videos, channels);

    const filteredIds = filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      hidePremieres: true,
    }).map(item => item.video.id);

    expect(filteredIds).toContain('live-replay');
    expect(filteredIds).not.toContain('premiere');
  });

  it('can mute videos by keyword', () => {
    const index = buildVideoFeedIndex(videos, channels);

    expect(filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      mutedKeywords: ['linux', 'reaction'],
    }).map(item => item.video.id)).toEqual(['short', 'premiere']);
  });

  it('boosts keyword matches to the top without hiding the rest', () => {
    const index = buildVideoFeedIndex(videos, channels);

    expect(filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      boostedKeywords: ['football'],
    }).map(item => item.video.id)).toEqual(['live-replay', 'normal', 'channel-match', 'short', 'premiere']);
  });

  it('can hide duplicate normalized titles', () => {
    const duplicateVideos: YouTubeVideo[] = [
      {
        id: 'first',
        title: 'Apple Event Highlights!',
        description: '',
        thumbnail: '',
        channelId: 'tech',
        channelTitle: 'Tech Channel',
        publishedAt: FIXED_PUBLISHED_AT,
      },
      {
        id: 'second',
        title: 'Apple event highlights',
        description: '',
        thumbnail: '',
        channelId: 'news',
        channelTitle: 'News Channel',
        publishedAt: FIXED_PUBLISHED_AT,
      },
      {
        id: 'unique',
        title: 'Linux weekly roundup',
        description: '',
        thumbnail: '',
        channelId: 'linux-news',
        channelTitle: 'Linux News',
        publishedAt: FIXED_PUBLISHED_AT,
      },
    ];
    const index = buildVideoFeedIndex(duplicateVideos, []);

    expect(filterIndexedVideos(index, {
      searchQuery: '',
      showShorts: true,
      hideDuplicateTitles: true,
    }).map(item => item.video.id)).toEqual(['first', 'unique']);
  });
});
