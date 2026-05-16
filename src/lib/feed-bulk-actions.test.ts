import { describe, expect, it } from 'vitest';
import { getVideoIdsOlderThan, getVisibleVideoIds } from './feed-bulk-actions';
import type { YouTubeVideo } from '../types/youtube';

const videos: YouTubeVideo[] = [
  {
    id: 'old',
    title: 'Old video',
    description: '',
    thumbnail: '',
    channelId: 'UC1',
    channelTitle: 'Channel',
    publishedAt: '2026-05-01T00:00:00.000Z',
  },
  {
    id: 'new',
    title: 'New video',
    description: '',
    thumbnail: '',
    channelId: 'UC1',
    channelTitle: 'Channel',
    publishedAt: '2026-05-15T00:00:00.000Z',
  },
  {
    id: 'bad-date',
    title: 'Bad date video',
    description: '',
    thumbnail: '',
    channelId: 'UC1',
    channelTitle: 'Channel',
    publishedAt: 'not-a-date',
  },
];

describe('feed bulk actions', () => {
  it('returns ids for visible videos in order', () => {
    expect(getVisibleVideoIds(videos)).toEqual(['old', 'new', 'bad-date']);
  });

  it('returns ids older than a day threshold', () => {
    expect(getVideoIdsOlderThan(videos, {
      now: Date.parse('2026-05-16T00:00:00.000Z'),
      days: 7,
    })).toEqual(['old']);
  });

  it('ignores videos with invalid published dates', () => {
    expect(getVideoIdsOlderThan(videos, {
      now: Date.parse('2026-05-16T00:00:00.000Z'),
      days: 0,
    })).toEqual(['old', 'new']);
  });
});
