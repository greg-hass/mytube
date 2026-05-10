import { describe, expect, it, vi } from 'vitest';
import {
  createAppBackup,
  restoreAppBackup,
  type AppBackupLocalData,
} from './app-backup';
import type { YouTubeChannel } from '../types/youtube';

const channels: YouTubeChannel[] = [
  {
    id: 'UC123',
    title: 'Test Channel',
    description: '',
    thumbnail: 'https://example.com/channel.jpg',
    group: 'Tech',
    isFavorite: true,
    isMuted: false,
  },
];

describe('app backup', () => {
  it('exports subscriptions, watched ids, favorites, queue, and feed filters', () => {
    const localData: AppBackupLocalData = {
      favoriteVideoIds: ['video-1'],
      favoriteVideos: [{ id: 'video-1', title: 'Favorite', description: '', thumbnail: '', channelId: 'UC123', channelTitle: 'Test Channel', publishedAt: '2026-05-09T12:00:00.000Z' }],
      queuedVideoIds: ['video-2'],
      queuedVideos: [{ id: 'video-2', title: 'Queued', description: '', thumbnail: '', channelId: 'UC123', channelTitle: 'Test Channel', publishedAt: '2026-05-09T12:00:00.000Z' }],
      feedQualityFilters: { durationFilter: '10-30', hidePremieres: true },
    };

    const backup = createAppBackup({
      subscriptions: channels,
      watchedVideoIds: ['video-3'],
      settings: { apiKey: 'key' },
      localData,
      exportedAt: '2026-05-09T12:00:00.000Z',
    });

    expect(backup).toMatchObject({
      version: 2,
      exportedAt: '2026-05-09T12:00:00.000Z',
      subscriptions: channels,
      settings: { apiKey: 'key' },
      watchedVideos: ['video-3'],
      favorites: {
        videoIds: ['video-1'],
      },
      queue: {
        videoIds: ['video-2'],
      },
      feedQualityFilters: { durationFilter: '10-30', hidePremieres: true },
    });
  });

  it('restores client-side local data and returns subscriptions plus watched ids', () => {
    const storage = new Map<string, string>();
    const dispatchEvent = vi.fn();
    const backup = createAppBackup({
      subscriptions: channels,
      watchedVideoIds: ['video-3'],
      settings: { apiKey: 'key' },
      localData: {
        favoriteVideoIds: ['video-1'],
        favoriteVideos: [{ id: 'video-1', title: 'Favorite', description: '', thumbnail: '', channelId: 'UC123', channelTitle: 'Test Channel', publishedAt: '2026-05-09T12:00:00.000Z' }],
        queuedVideoIds: ['video-2'],
        queuedVideos: [{ id: 'video-2', title: 'Queued', description: '', thumbnail: '', channelId: 'UC123', channelTitle: 'Test Channel', publishedAt: '2026-05-09T12:00:00.000Z' }],
        feedQualityFilters: { mutedKeywordText: 'rumor' },
      },
      exportedAt: '2026-05-09T12:00:00.000Z',
    });

    const result = restoreAppBackup(JSON.stringify(backup), {
      storage: {
        setItem: (key, value) => storage.set(key, value),
      },
      dispatchEvent,
    });

    expect(result.subscriptions).toEqual(channels);
    expect(result.watchedVideoIds).toEqual(['video-3']);
    expect(result.settings).toEqual({ apiKey: 'key' });
    expect(JSON.parse(storage.get('favorite-video-ids') || '[]')).toEqual(['video-1']);
    expect(JSON.parse(storage.get('queued-video-ids') || '[]')).toEqual(['video-2']);
    expect(JSON.parse(storage.get('feed-quality-filters') || '{}')).toEqual({ mutedKeywordText: 'rumor' });
    expect(dispatchEvent).toHaveBeenCalledWith('favorite-videos-changed');
    expect(dispatchEvent).toHaveBeenCalledWith('queued-videos-changed');
  });
});
