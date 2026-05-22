import { describe, expect, it, vi } from 'vitest';
import {
  createAppBackup,
  readBackupLocalData,
  restoreAppBackup,
  type AppBackupLocalData,
} from './app-backup';
import { FEED_VIEW_PRESETS_CHANGED_EVENT } from './feed-view-presets';
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
      watchedVideos: ['video-3'],
      favorites: {
        videoIds: ['video-1'],
      },
      queue: {
        videoIds: ['video-2'],
      },
      feedQualityFilters: { durationFilter: '10-30', hidePremieres: true },
    });
    expect(backup.settings).toEqual({});
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
    expect(result.settings).toEqual({});
    expect(JSON.parse(storage.get('favorite-video-ids') || '[]')).toEqual(['video-1']);
    expect(JSON.parse(storage.get('queued-video-ids') || '[]')).toEqual(['video-2']);
    expect(JSON.parse(storage.get('feed-quality-filters') || '{}')).toEqual({ mutedKeywordText: 'rumor' });
    expect(dispatchEvent).toHaveBeenCalledWith('favorite-videos-changed');
    expect(dispatchEvent).toHaveBeenCalledWith('queued-videos-changed');
    expect(dispatchEvent).toHaveBeenCalledWith(FEED_VIEW_PRESETS_CHANGED_EVENT);
  });

  it('exports and restores saved feed views', () => {
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const dispatchEvent = vi.fn();

    storage.set('feed-view-presets', JSON.stringify([
      {
        id: 'preset-1',
        name: 'Longform',
        filters: {
          showShorts: false,
          hideWatched: true,
          durationFilter: '30-plus',
          hideLiveReplays: false,
          hidePremieres: false,
          hideDuplicateTitles: false,
          mutedKeywordText: '',
          boostedKeywordText: '',
        },
        createdAt: '2026-05-16T10:00:00.000Z',
        updatedAt: '2026-05-16T10:00:00.000Z',
      },
    ]));

    const backup = createAppBackup({
      subscriptions: [],
      watchedVideoIds: [],
      settings: {},
      localData: readBackupLocalData(fakeStorage),
      exportedAt: '2026-05-16T10:30:00.000Z',
    });

    expect(backup.feedViewPresets).toHaveLength(1);

    restoreAppBackup(JSON.stringify(backup), { storage: fakeStorage, dispatchEvent });

    expect(JSON.parse(storage.get('feed-view-presets') || '[]')).toEqual(backup.feedViewPresets);
    expect(dispatchEvent).toHaveBeenCalledWith(FEED_VIEW_PRESETS_CHANGED_EVENT);
  });

  it('restores missing or malformed saved feed views as an empty list', () => {
    const storage = new Map<string, string>();
    const fakeStorage = {
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const dispatchEvent = vi.fn();

    restoreAppBackup(JSON.stringify({
      version: 2,
      exportedAt: '2026-05-16T10:30:00.000Z',
      subscriptions: [],
      settings: {},
      watchedVideos: [],
      favorites: { videoIds: [], videos: [] },
      queue: { videoIds: [], videos: [] },
      feedQualityFilters: {},
      feedViewPresets: {},
    }), { storage: fakeStorage, dispatchEvent });

    expect(JSON.parse(storage.get('feed-view-presets') || 'null')).toEqual([]);
    expect(dispatchEvent).toHaveBeenCalledWith(FEED_VIEW_PRESETS_CHANGED_EVENT);
  });
});
