import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  getAllCachedVideos,
  addCachedVideos,
  clearAllCachedVideos,
  removeOldCachedVideos,
  type CachedVideo,
} from '../lib/indexeddb';
import { fetchMultipleChannelFeeds } from '../lib/rss-fetcher';
import { useStore } from '../store/useStore';
import type { YouTubeVideo } from '../types/youtube';

// Cache TTL: 1 hour (reduced sync frequency for better UX)
const CACHE_TTL = 60 * 60 * 1000;

// Batch size for fetching
const BATCH_SIZE = 2; // Reduced from 5 to avoid rate limits
const BATCH_DELAY = 3000; // Increased to 3 seconds between batches

export interface SyncStatus {
  total: number;
  current: number;
  isSyncing: boolean;
  lastUpdated: number;
  errors: number;
}

/**
 * Hook for fetching and managing videos from RSS feeds
 * Provides automatic caching, refresh, and cleanup
 */
export const useRSSVideos = (options?: {
  channelIds?: string[];
  maxChannels?: number; // Deprecated, but kept for compatibility
  autoRefresh?: boolean;
  refreshInterval?: number;
  forceFetch?: boolean;
}) => {
  const queryClient = useQueryClient();
  const {
    channelIds = [],
    autoRefresh = true,
  } = options || {};

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    total: 0,
    current: 0,
    isSyncing: false,
    lastUpdated: Date.now(),
    errors: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch cached videos from IndexedDB
  const {
    data: cachedVideos,
    isLoading: isCacheLoading,
    error: cacheError,
  } = useQuery({
    queryKey: ['cached-videos'],
    queryFn: getAllCachedVideos,
    staleTime: 1000 * 60, // 1 minute - refresh often to show new videos
  });

  // Check if cache is stale (older than TTL)
  const isCacheStale = useMemo(() => {
    if (!cachedVideos || cachedVideos.length === 0) return true;

    const now = Date.now();
    const oldestCacheTime = Math.min(...cachedVideos.map((v) => v.cachedAt));
    return now - oldestCacheTime > CACHE_TTL;
  }, [cachedVideos]);

  // Background fetching logic
  const startBackgroundSync = useCallback(async () => {
    if (syncStatus.isSyncing) return;

    // Cancel any previous sync
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const validChannelIds = channelIds; // Allow all IDs, let fetchMultipleChannelFeeds handle resolution

    if (validChannelIds.length === 0) return;

    setSyncStatus(prev => ({
      ...prev,
      total: validChannelIds.length,
      current: 0,
      isSyncing: true,
      errors: 0,
    }));

    try {
      // Check if using API to determine batch size
      const { apiKey, useApiForVideos } = useStore.getState();
      const batchSize = (apiKey && useApiForVideos) ? 50 : BATCH_SIZE; // API can handle 50 channels at once!

      // Process in batches
      for (let i = 0; i < validChannelIds.length; i += batchSize) {
        if (abortControllerRef.current?.signal.aborted) break;

        const batch = validChannelIds.slice(i, i + batchSize);

        // Fetch batch
        let videos: YouTubeVideo[] = [];
        let resolvedChannels = new Map<string, { id: string; title: string; thumbnail?: string }>();

        if (apiKey && useApiForVideos) {
          // Use API if key is available AND enabled
          const { fetchVideosForChannelsAPI, resolveTemporaryChannelFromRSS } = await import('../lib/youtube-api');

          // Pre-resolve any temporary IDs in this batch
          const resolvedBatchIds: string[] = [];

          for (const id of batch) {
            if (id.startsWith('handle_') || id.startsWith('custom_')) {
              const resolved = await resolveTemporaryChannelFromRSS(id, apiKey);
              if (resolved) {
                resolvedChannels.set(id, resolved);
                resolvedBatchIds.push(resolved.id);
              }
            } else {
              resolvedBatchIds.push(id);
            }
          }

          if (resolvedBatchIds.length > 0) {
            videos = await fetchVideosForChannelsAPI(resolvedBatchIds, apiKey);
          }
        } else {
          // Fallback to RSS
          videos = await fetchMultipleChannelFeeds(batch);
          // Get resolved channels from the RSS fetcher side-effect
          const rssResolved = (fetchMultipleChannelFeeds as any).resolvedChannels as Map<string, { id: string; title: string; thumbnail?: string }>;
          if (rssResolved) {
            resolvedChannels = rssResolved;
          }
        }

        // Handle resolved channels

        if (resolvedChannels && resolvedChannels.size > 0) {
          const { getAllSubscriptions, replaceSubscription } = await import('../lib/indexeddb');
          const allSubs = await getAllSubscriptions();

          const updatePromises: Promise<void>[] = [];
          resolvedChannels.forEach((resolved, tempId) => {
            const existingSub = allSubs.find(sub => sub.id === tempId);
            if (existingSub) {
              console.log(`💾 Updating subscription ${tempId} -> ${resolved.id}`);
              const updatedSub = {
                ...existingSub,
                id: resolved.id,
                title: resolved.title,
                thumbnail: resolved.thumbnail || existingSub.thumbnail
              };
              updatePromises.push(replaceSubscription(tempId, updatedSub));
            } else {
              console.warn(`⚠️ Could not find existing subscription for ${tempId}`);
            }
          });

          if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
          }
        }

        // Store in cache
        if (videos.length > 0) {
          const cachedVideosData: CachedVideo[] = videos.map((video) => ({
            id: video.id,
            title: video.title,
            channelId: video.channelId,
            channelTitle: video.channelTitle,
            publishedAt: video.publishedAt,
            thumbnail: video.thumbnail,
            description: video.description,
            cachedAt: Date.now(),
          }));

          await addCachedVideos(cachedVideosData);

          // Invalidate cache query to show fresh data immediately
          queryClient.invalidateQueries({ queryKey: ['cached-videos'] });
        }

        // Update progress
        setSyncStatus(prev => ({
          ...prev,
          current: Math.min(i + batchSize, validChannelIds.length),
        }));

        // Delay between batches to be nice to APIs/Proxies (skip delay for API mode since it's fast)
        if (i + batchSize < validChannelIds.length && !(apiKey && useApiForVideos)) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }
    } catch (error) {
      console.error('Background sync error:', error);
      setSyncStatus(prev => ({ ...prev, errors: prev.errors + 1 }));
    } finally {
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastUpdated: Date.now(),
      }));
    }
  }, [channelIds, queryClient, syncStatus.isSyncing]);

  // Auto-start sync if needed
  useEffect(() => {
    if (autoRefresh && channelIds.length > 0 && isCacheStale && !syncStatus.isSyncing) {
      startBackgroundSync();
    }
  }, [autoRefresh, channelIds.length, isCacheStale]); // Removed syncStatus.isSyncing to avoid loops, handled in startBackgroundSync

  // Convert cached videos to YouTubeVideo format
  const cachedYouTubeVideos = useMemo<YouTubeVideo[]>(() => {
    if (!cachedVideos) return [];

    const filtered = channelIds.length
      ? cachedVideos.filter((video) => channelIds.includes(video.channelId))
      : cachedVideos;

    return filtered
      .map((video) => ({
        id: video.id,
        title: video.title,
        channelId: video.channelId,
        channelTitle: video.channelTitle,
        publishedAt: video.publishedAt,
        thumbnail: video.thumbnail,
        description: video.description,
      }))
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
  }, [cachedVideos, channelIds]);

  // Mutation to clear video cache
  const clearCache = useMutation({
    mutationFn: clearAllCachedVideos,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cached-videos'] });
    },
  });

  // Mutation to clean up old cached videos
  const cleanupOldCache = useMutation({
    mutationFn: async (maxAge: number = CACHE_TTL * 7) => {
      return await removeOldCachedVideos(maxAge);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cached-videos'] });
    },
  });

  // Get cache status info
  const cacheStatus = useMemo(() => {
    if (!cachedVideos || cachedVideos.length === 0) {
      return {
        hasCache: false,
        isStale: true,
        age: 0,
        videoCount: 0,
      };
    }

    const now = Date.now();
    const oldestCacheTime = Math.min(...cachedVideos.map((v) => v.cachedAt));
    const age = now - oldestCacheTime;

    return {
      hasCache: true,
      isStale: age > CACHE_TTL,
      age,
      videoCount: cachedVideos.length,
    };
  }, [cachedVideos]);

  return {
    // Data
    videos: cachedYouTubeVideos, // Always return cached videos, which update as we fetch
    cachedVideos: cachedYouTubeVideos,

    // Loading states
    isLoading: isCacheLoading,
    isFetching: syncStatus.isSyncing,
    isCacheLoading,
    syncStatus,

    // Error states
    error: cacheError,
    fetchError: null, // We handle errors internally in the sync process
    cacheError,

    // Cache status
    cacheStatus,
    isCacheStale,

    // Actions
    refresh: startBackgroundSync,
    clearCache: clearCache.mutateAsync,
    cleanupOldCache: cleanupOldCache.mutateAsync,

    // Mutation states
    isClearing: clearCache.isPending,
    isCleaning: cleanupOldCache.isPending,
  };
};
