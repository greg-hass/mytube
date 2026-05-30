import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { YouTubeVideo } from '../types/youtube';
import { readRawStorage, parseVideoIds, parseVideos } from './local-storage-list';

const IDS_STORAGE_KEY = 'queued-video-ids';
const VIDEOS_STORAGE_KEY = 'queued-videos';
const QUEUE_CHANGED_EVENT = 'queued-videos-changed';

function getQueueSnapshot() {
  return JSON.stringify({
    ids: readRawStorage(IDS_STORAGE_KEY),
    videos: readRawStorage(VIDEOS_STORAGE_KEY),
  });
}

function subscribeToQueue(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(QUEUE_CHANGED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(QUEUE_CHANGED_EVENT, onStoreChange);
  };
}

function writeQueue(ids: string[], videosById: Map<string, YouTubeVideo>) {
  localStorage.setItem(IDS_STORAGE_KEY, JSON.stringify(ids));
  localStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(ids.map((id) => videosById.get(id)).filter(Boolean)));
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export function useQueuedVideos() {
  const snapshot = useSyncExternalStore(subscribeToQueue, getQueueSnapshot, () => '{"ids":null,"videos":null}');

  const { queuedVideoIds, queuedVideos } = useMemo(() => {
    const snapshotValue = JSON.parse(snapshot) as { ids: string | null; videos: string | null };
    const ids = parseVideoIds(snapshotValue.ids);
    const videosById = new Map(parseVideos(snapshotValue.videos).map((video) => [video.id, video]));

    for (const video of videosById.values()) {
      if (!ids.includes(video.id)) {
        ids.push(video.id);
      }
    }

    return {
      queuedVideoIds: new Set(ids),
      queuedVideos: ids.map((id) => videosById.get(id)).filter((video): video is YouTubeVideo => Boolean(video)),
    };
  }, [snapshot]);

  const addQueuedVideo = useCallback((video: YouTubeVideo) => {
    const ids = parseVideoIds(readRawStorage(IDS_STORAGE_KEY));
    const videosById = new Map(parseVideos(readRawStorage(VIDEOS_STORAGE_KEY)).map((queuedVideo) => [queuedVideo.id, queuedVideo]));

    if (!ids.includes(video.id)) {
      ids.push(video.id);
    }
    videosById.set(video.id, video);

    writeQueue(ids, videosById);
  }, []);

  const removeQueuedVideo = useCallback((videoId: string) => {
    const ids = parseVideoIds(readRawStorage(IDS_STORAGE_KEY)).filter((id) => id !== videoId);
    const videosById = new Map(parseVideos(readRawStorage(VIDEOS_STORAGE_KEY)).map((queuedVideo) => [queuedVideo.id, queuedVideo]));
    videosById.delete(videoId);

    writeQueue(ids, videosById);
  }, []);

  const toggleQueuedVideo = useCallback((video: YouTubeVideo) => {
    const currentIds = parseVideoIds(readRawStorage(IDS_STORAGE_KEY));

    if (currentIds.includes(video.id)) {
      removeQueuedVideo(video.id);
    } else {
      addQueuedVideo(video);
    }
  }, [addQueuedVideo, removeQueuedVideo]);

  return {
    queuedVideoIds,
    queuedVideos,
    isQueuedVideo: useCallback((videoId: string) => queuedVideoIds.has(videoId), [queuedVideoIds]),
    addQueuedVideo,
    removeQueuedVideo,
    toggleQueuedVideo,
  };
}
