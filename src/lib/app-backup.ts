import type { YouTubeVideo } from '../types/youtube';
import { FEED_VIEW_PRESETS_CHANGED_EVENT, FEED_VIEW_PRESETS_STORAGE_KEY } from './feed-view-presets';
import {
  SUBSCRIPTION_GROUPS_CHANGED_EVENT,
  SUBSCRIPTION_GROUPS_STORAGE_KEY,
  normalizeSubscriptionGroups,
  readSubscriptionGroups,
} from './subscription-groups';

const FAVORITE_IDS_STORAGE_KEY = 'favorite-video-ids';
const FAVORITE_VIDEOS_STORAGE_KEY = 'favorite-videos';
const QUEUE_IDS_STORAGE_KEY = 'queued-video-ids';
const QUEUE_VIDEOS_STORAGE_KEY = 'queued-videos';
const FEED_QUALITY_FILTERS_STORAGE_KEY = 'feed-quality-filters';
const FAVORITES_CHANGED_EVENT = 'favorite-videos-changed';
const QUEUE_CHANGED_EVENT = 'queued-videos-changed';

export type AppBackupLocalData = {
  favoriteVideoIds?: string[];
  favoriteVideos?: YouTubeVideo[];
  queuedVideoIds?: string[];
  queuedVideos?: YouTubeVideo[];
  feedQualityFilters?: Record<string, unknown>;
  feedViewPresets?: unknown[];
  subscriptionGroups?: string[];
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
  subscriptionGroups: string[];
};

export type ParsedAppBackup = {
  exportedAt: string | null;
  subscriptions: AppBackupSubscription[];
  watchedVideoIds: string[];
  settings: AppBackup['settings'];
  favorites: AppBackup['favorites'];
  queue: AppBackup['queue'];
  feedQualityFilters: Record<string, unknown>;
  feedViewPresets: unknown[];
  subscriptionGroups: string[];
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
    subscriptionGroups: readSubscriptionGroups(storage),
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
    settings: removeSensitiveBackupSettings(settings),
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
    subscriptionGroups: localData.subscriptionGroups || [],
  };
}

function removeSensitiveBackupSettings(settings: AppBackup['settings']): AppBackup['settings'] {
  const nonSensitiveSettings = { ...settings };
  delete nonSensitiveSettings.apiKey;
  return nonSensitiveSettings;
}

export function restoreAppBackup(backupJson: string, options: RestoreAppBackupOptions = {}) {
  const restored = parseAppBackup(backupJson);
  applyRestoredAppBackup(restored, options);

  return {
    subscriptions: restored.subscriptions,
    watchedVideoIds: restored.watchedVideoIds,
    settings: restored.settings,
  };
}

export function parseAppBackup(backupJson: string): ParsedAppBackup {
  const backup = JSON.parse(backupJson) as Partial<AppBackup>;
  if (!Array.isArray(backup.subscriptions)) {
    throw new Error('Invalid backup: missing subscriptions');
  }

  const favorites = backup.favorites || { videoIds: [], videos: [] };
  const queue = backup.queue || { videoIds: [], videos: [] };

  return {
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : null,
    subscriptions: backup.subscriptions,
    watchedVideoIds: Array.isArray(backup.watchedVideos) ? backup.watchedVideos : [],
    settings: backup.settings || {},
    favorites: {
      videoIds: Array.isArray(favorites.videoIds) ? favorites.videoIds : [],
      videos: Array.isArray(favorites.videos) ? favorites.videos : [],
    },
    queue: {
      videoIds: Array.isArray(queue.videoIds) ? queue.videoIds : [],
      videos: Array.isArray(queue.videos) ? queue.videos : [],
    },
    feedQualityFilters: backup.feedQualityFilters || {},
    feedViewPresets: Array.isArray(backup.feedViewPresets) ? backup.feedViewPresets : [],
    subscriptionGroups: normalizeSubscriptionGroups(backup.subscriptionGroups),
  };
}

export function applyRestoredAppBackup(
  restored: ParsedAppBackup,
  options: RestoreAppBackupOptions = {},
): void {
  const storage = options.storage || window.localStorage;
  const dispatchEvent = options.dispatchEvent || ((eventName: string) => window.dispatchEvent(new Event(eventName)));

  storage.setItem(FAVORITE_IDS_STORAGE_KEY, JSON.stringify(restored.favorites.videoIds));
  storage.setItem(FAVORITE_VIDEOS_STORAGE_KEY, JSON.stringify(restored.favorites.videos));
  storage.setItem(QUEUE_IDS_STORAGE_KEY, JSON.stringify(restored.queue.videoIds));
  storage.setItem(QUEUE_VIDEOS_STORAGE_KEY, JSON.stringify(restored.queue.videos));
  storage.setItem(FEED_QUALITY_FILTERS_STORAGE_KEY, JSON.stringify(restored.feedQualityFilters));
  storage.setItem(FEED_VIEW_PRESETS_STORAGE_KEY, JSON.stringify(restored.feedViewPresets));
  storage.setItem(SUBSCRIPTION_GROUPS_STORAGE_KEY, JSON.stringify(restored.subscriptionGroups));
  dispatchEvent(FAVORITES_CHANGED_EVENT);
  dispatchEvent(QUEUE_CHANGED_EVENT);
  dispatchEvent(FEED_VIEW_PRESETS_CHANGED_EVENT);
  dispatchEvent(SUBSCRIPTION_GROUPS_CHANGED_EVENT);
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
