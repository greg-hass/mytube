import type { YouTubeVideo } from '../types/youtube';

const FAVORITE_IDS_STORAGE_KEY = 'favorite-video-ids';
const FAVORITE_VIDEOS_STORAGE_KEY = 'favorite-videos';
const QUEUE_IDS_STORAGE_KEY = 'queued-video-ids';
const QUEUE_VIDEOS_STORAGE_KEY = 'queued-videos';
const FEED_QUALITY_FILTERS_STORAGE_KEY = 'feed-quality-filters';
const FEED_VIEW_PRESETS_STORAGE_KEY = 'feed-view-presets';
const FAVORITES_CHANGED_EVENT = 'favorite-videos-changed';
const QUEUE_CHANGED_EVENT = 'queued-videos-changed';

export type AppBackupLocalData = {
  favoriteVideoIds?: string[];
  favoriteVideos?: YouTubeVideo[];
  queuedVideoIds?: string[];
  queuedVideos?: YouTubeVideo[];
  feedQualityFilters?: Record<string, unknown>;
  feedViewPresets?: unknown[];
};

export type AppBackupSubscription = {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  customUrl?: string;
  isFavorite?: boolean;
  isMuted?: boolean;
  group?: string;
  addedAt?: number;
};

export type AppBackup = {
  version: 2;
  exportedAt: string;
  subscriptions: AppBackupSubscription[];
  settings: {
    apiKey?: string;
  };
  watchedVideos: string[];
  favorites: {
    videoIds: string[];
    videos: YouTubeVideo[];
  };
  queue: {
    videoIds: string[];
    videos: YouTubeVideo[];
  };
  feedQualityFilters: Record<string, unknown>;
  feedViewPresets: unknown[];
};

type CreateAppBackupOptions = {
  subscriptions: AppBackupSubscription[];
  watchedVideoIds: string[];
  settings: AppBackup['settings'];
  localData?: AppBackupLocalData;
  exportedAt?: string;
};

type RestoreAppBackupOptions = {
  storage?: Pick<Storage, 'setItem'>;
  dispatchEvent?: (eventName: string) => void;
};

export function readBackupLocalData(storage: Pick<Storage, 'getItem'> = window.localStorage): AppBackupLocalData {
  return {
    favoriteVideoIds: parseJsonArray(storage.getItem(FAVORITE_IDS_STORAGE_KEY)),
    favoriteVideos: parseJsonArray(storage.getItem(FAVORITE_VIDEOS_STORAGE_KEY)),
    queuedVideoIds: parseJsonArray(storage.getItem(QUEUE_IDS_STORAGE_KEY)),
    queuedVideos: parseJsonArray(storage.getItem(QUEUE_VIDEOS_STORAGE_KEY)),
    feedQualityFilters: parseJsonObject(storage.getItem(FEED_QUALITY_FILTERS_STORAGE_KEY)),
    feedViewPresets: parseJsonArray(storage.getItem(FEED_VIEW_PRESETS_STORAGE_KEY)),
  };
}

export function createAppBackup({
  subscriptions,
  watchedVideoIds,
  settings,
  localData = {},
  exportedAt = new Date().toISOString(),
}: CreateAppBackupOptions): AppBackup {
  return {
    version: 2,
    exportedAt,
    subscriptions,
    settings,
    watchedVideos: watchedVideoIds,
    favorites: {
      videoIds: localData.favoriteVideoIds || [],
      videos: localData.favoriteVideos || [],
    },
    queue: {
      videoIds: localData.queuedVideoIds || [],
      videos: localData.queuedVideos || [],
    },
    feedQualityFilters: localData.feedQualityFilters || {},
    feedViewPresets: localData.feedViewPresets || [],
  };
}

export function restoreAppBackup(backupJson: string, options: RestoreAppBackupOptions = {}) {
  const backup = JSON.parse(backupJson) as Partial<AppBackup>;
  if (!Array.isArray(backup.subscriptions)) {
    throw new Error('Invalid backup: missing subscriptions');
  }

  const storage = options.storage || window.localStorage;
  const dispatchEvent = options.dispatchEvent || ((eventName: string) => window.dispatchEvent(new Event(eventName)));
  const favorites = backup.favorites || { videoIds: [], videos: [] };
  const queue = backup.queue || { videoIds: [], videos: [] };

  storage.setItem(FAVORITE_IDS_STORAGE_KEY, JSON.stringify(favorites.videoIds || []));
  storage.setItem(FAVORITE_VIDEOS_STORAGE_KEY, JSON.stringify(favorites.videos || []));
  storage.setItem(QUEUE_IDS_STORAGE_KEY, JSON.stringify(queue.videoIds || []));
  storage.setItem(QUEUE_VIDEOS_STORAGE_KEY, JSON.stringify(queue.videos || []));
  storage.setItem(FEED_QUALITY_FILTERS_STORAGE_KEY, JSON.stringify(backup.feedQualityFilters || {}));
  storage.setItem(FEED_VIEW_PRESETS_STORAGE_KEY, JSON.stringify(backup.feedViewPresets || []));
  dispatchEvent(FAVORITES_CHANGED_EVENT);
  dispatchEvent(QUEUE_CHANGED_EVENT);

  return {
    subscriptions: backup.subscriptions,
    watchedVideoIds: Array.isArray(backup.watchedVideos) ? backup.watchedVideos : [],
    settings: backup.settings || {},
  };
}

function parseJsonArray(rawValue: string | null) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(rawValue: string | null) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
