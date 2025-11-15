import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import {
  getAllCachedVideos,
  addCachedVideos,
  clearAllCachedVideos,
  removeOldCachedVideos,
  type CachedVideo,
} from '../lib/indexeddb';
import { fetchMultipleChannelFeeds } from '../lib/rss-fetcher';
import type { YouTubeVideo } from '../types/youtube';

// Cache TTL: 30 minutes
const CACHE_TTL = 30 * 60 * 1000;

// Max number of channels to fetch videos for
const DEFAULT_CHANNEL_LIMIT = 50;

/**
 * Hook for fetching and managing videos from RSS feeds
 * Provides automatic caching, refresh, and cleanup
 */
export const useRSSVideos = (options?: {
  channelIds?: string[];
  maxChannels?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}) => {
  const queryClient = useQueryClient();
  const {
    channelIds = [],
    maxChannels = DEFAULT_CHANNEL_LIMIT,
    autoRefresh = true,
    refreshInterval = CACHE_TTL,
  } = options || {};

  // Fetch cached videos from IndexedDB
  const {
    data: cachedVideos,
    isLoading: isCacheLoading,
    error: cacheError,
  } = useQuery({
    queryKey: ['cached-videos'],
    queryFn: getAllCachedVideos,
    staleTime: CACHE_TTL,
  });

  // Check if cache is stale (older than TTL)
  const isCacheStale = useMemo(() => {
    if (!cachedVideos || cachedVideos.length === 0) return true;

    const now = Date.now();
    const oldestCacheTime = Math.min(...cachedVideos.map((v) => v.cachedAt));
    return now - oldestCacheTime > CACHE_TTL;
  }, [cachedVideos]);

  // Fetch fresh videos from RSS feeds
  const {
    data: freshVideos,
    isLoading: isFetching,
    error: fetchError,
    refetch: refetchVideos,
  } = useQuery({
    queryKey: ['rss-videos', channelIds],
    queryFn: async () => {
      if (channelIds.length === 0) return [];

      // Limit number of channels to avoid overwhelming the CORS proxy
      const channelsToFetch = channelIds.slice(0, maxChannels);

      // Fetch RSS feeds
      const videos = await fetchMultipleChannelFeeds(channelsToFetch);

      // Convert to CachedVideo format and store in cache
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

      // Store in IndexedDB cache
      if (cachedVideosData.length > 0) {
        await addCachedVideos(cachedVideosData);
        // Invalidate cache query to show fresh data
        queryClient.invalidateQueries({ queryKey: ['cached-videos'] });
      }

      return videos;
    },
    enabled: channelIds.length > 0 && (isCacheStale || !cachedVideos),
    staleTime: CACHE_TTL,
    gcTime: CACHE_TTL * 2,
    refetchInterval: autoRefresh ? refreshInterval : false,
  });

  // Convert cached videos to YouTubeVideo format
  const cachedYouTubeVideos = useMemo<YouTubeVideo[]>(() => {
    if (!cachedVideos) return [];

    return cachedVideos
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
  }, [cachedVideos]);

  // Determine which videos to show (prefer fresh, fallback to cached)
  const videos = useMemo(() => {
    if (freshVideos && freshVideos.length > 0) {
      return freshVideos;
    }
    return cachedYouTubeVideos;
  }, [freshVideos, cachedYouTubeVideos]);

  // Mutation to clear video cache
  const clearCache = useMutation({
    mutationFn: clearAllCachedVideos,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cached-videos'] });
      queryClient.invalidateQueries({ queryKey: ['rss-videos'] });
    },
  });

  // Mutation to clean up old cached videos
  const cleanupOldCache = useMutation({
    mutationFn: async (maxAge: number = CACHE_TTL * 7) => {
      // Default: remove cache older than 7x TTL (3.5 hours)
      return await removeOldCachedVideos(maxAge);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cached-videos'] });
    },
  });

  // Manual refresh function
  const refresh = useCallback(async () => {
    await refetchVideos();
  }, [refetchVideos]);

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
    videos,
    cachedVideos: cachedYouTubeVideos,

    // Loading states
    isLoading: isCacheLoading || isFetching,
    isFetching,
    isCacheLoading,

    // Error states
    error: fetchError || cacheError,
    fetchError,
    cacheError,

    // Cache status
    cacheStatus,
    isCacheStale,

    // Actions
    refresh,
    clearCache: clearCache.mutateAsync,
    cleanupOldCache: cleanupOldCache.mutateAsync,

    // Mutation states
    isClearing: clearCache.isPending,
    isCleaning: cleanupOldCache.isPending,
  };
};
