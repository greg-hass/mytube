import { useCallback, useSyncExternalStore } from 'react';
import type { YouTubeVideo } from '../types/youtube';
import { readRawStorage, parseVideoIds, parseVideos } from './local-storage-list';

const IDS_STORAGE_KEY = 'favorite-video-ids';
const VIDEOS_STORAGE_KEY = 'favorite-videos';
const FAVORITES_CHANGED_EVENT = 'favorite-videos-changed';

const EMPTY_SNAPSHOT = { favoriteVideoIds: new Set<string>(), favoriteVideos: [] as YouTubeVideo[] };
let cachedIds: string | null | undefined;
let cachedVideos: string | null | undefined;
let cachedSnapshot = EMPTY_SNAPSHOT;

function getFavoriteSnapshot() {
  const rawIds = readRawStorage(IDS_STORAGE_KEY);
  const rawVideos = readRawStorage(VIDEOS_STORAGE_KEY);
  if (rawIds === cachedIds && rawVideos === cachedVideos) return cachedSnapshot;

  const ids = new Set(parseVideoIds(rawIds));
  const videosById = new Map<string, YouTubeVideo>();
  for (const video of parseVideos(rawVideos)) {
    ids.add(video.id);
    if (!videosById.has(video.id)) videosById.set(video.id, video);
  }

  cachedIds = rawIds;
  cachedVideos = rawVideos;
  cachedSnapshot = { favoriteVideoIds: ids, favoriteVideos: Array.from(videosById.values()) };
  return cachedSnapshot;
}

function subscribeToFavorites(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(FAVORITES_CHANGED_EVENT, onStoreChange);
  };
}

function writeFavorites(ids: Set<string>, videosById: Map<string, YouTubeVideo>) {
  localStorage.setItem(IDS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(Array.from(videosById.values())));
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
}

/**
 * Drop every favorited video belonging to a channel. Called when the
 * subscription is deleted so its videos disappear from the Favorites tab
 * instead of lingering as orphans.
 */
export function removeFavoriteVideosByChannel(channelId: string) {
  const storedVideos = parseVideos(readRawStorage(VIDEOS_STORAGE_KEY));
  const removedIds = new Set(
    storedVideos
      .filter((video) => video.channelId === channelId)
      .map((video) => video.id),
  );
  if (removedIds.size === 0) return;

  const ids = new Set(parseVideoIds(readRawStorage(IDS_STORAGE_KEY)));
  for (const removedId of removedIds) ids.delete(removedId);

  const videosById = new Map<string, YouTubeVideo>();
  for (const video of storedVideos) {
    if (!removedIds.has(video.id)) videosById.set(video.id, video);
  }

  writeFavorites(ids, videosById);
}

export function useFavoriteVideos() {
  const { favoriteVideoIds, favoriteVideos } = useSyncExternalStore(
    subscribeToFavorites, getFavoriteSnapshot, () => EMPTY_SNAPSHOT,
  );

  const toggleFavoriteVideo = useCallback((video: YouTubeVideo | string) => {
    const videoId = typeof video === 'string' ? video : video.id;
    const ids = new Set(parseVideoIds(readRawStorage(IDS_STORAGE_KEY)));
    const videosById = new Map(parseVideos(readRawStorage(VIDEOS_STORAGE_KEY)).map((favorite) => [favorite.id, favorite]));

    if (ids.has(videoId)) {
      ids.delete(videoId);
      videosById.delete(videoId);
    } else {
      ids.add(videoId);
      if (typeof video !== 'string') {
        videosById.set(video.id, video);
      }
    }

    writeFavorites(ids, videosById);
  }, []);

  return {
    favoriteVideoIds,
    favoriteVideos,
    isFavoriteVideo: useCallback((videoId: string) => favoriteVideoIds.has(videoId), [favoriteVideoIds]),
    toggleFavoriteVideo,
  };
}
