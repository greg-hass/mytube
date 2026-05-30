import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { YouTubeVideo } from '../types/youtube';
import { readRawStorage, parseVideoIds, parseVideos } from './local-storage-list';

const IDS_STORAGE_KEY = 'favorite-video-ids';
const VIDEOS_STORAGE_KEY = 'favorite-videos';
const FAVORITES_CHANGED_EVENT = 'favorite-videos-changed';

function getFavoriteSnapshot() {
  return JSON.stringify({
    ids: readRawStorage(IDS_STORAGE_KEY),
    videos: readRawStorage(VIDEOS_STORAGE_KEY),
  });
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

export function useFavoriteVideos() {
  const snapshot = useSyncExternalStore(subscribeToFavorites, getFavoriteSnapshot, () => '{"ids":null,"videos":null}');

  const { favoriteVideoIds, favoriteVideos } = useMemo(() => {
    const snapshotValue = JSON.parse(snapshot) as { ids: string | null; videos: string | null };
    const ids = new Set(parseVideoIds(snapshotValue.ids));
    const videos = parseVideos(snapshotValue.videos);

    for (const video of videos) {
      ids.add(video.id);
    }

    return {
      favoriteVideoIds: ids,
      favoriteVideos: videos.filter((video, index, allVideos) => (
        allVideos.findIndex((candidate) => candidate.id === video.id) === index
      )),
    };
  }, [snapshot]);

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
