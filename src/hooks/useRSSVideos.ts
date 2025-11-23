import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import type { YouTubeVideo } from '../types/youtube';

export interface SyncStatus {
  total: number;
  current: number;
  isSyncing: boolean;
  lastUpdated: number;
  errors: number;
}

/**
 * Hook for fetching videos from the server-side aggregator
 * Provides automatic caching and refresh
 */
export const useRSSVideos = () => {
  const queryClient = useQueryClient();

  // Fetch videos from server
  const {
    data: serverData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['server-videos'],
    queryFn: async () => {
      // Add timestamp to prevent caching
      const response = await fetch(`/api/videos?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch videos from server');
      }
      return response.json();
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 5, // Auto-refresh every 5 minutes
  });

  // Trigger server-side refresh
  const triggerServerRefresh = useMutation({
    mutationFn: async () => {
      toast.loading('Refreshing videos from server...');
      const response = await fetch('/api/videos/refresh', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to trigger server refresh');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success('Refresh complete!');
      // Invalidate immediately since server is done
      queryClient.invalidateQueries({ queryKey: ['server-videos'] });
    },
    onError: (error) => {
      toast.dismiss();
      toast.error(`Refresh failed: ${error.message}`);
    }
  });

  const videos = useMemo<YouTubeVideo[]>(() => {
    if (!serverData?.videos) return [];
    return serverData.videos;
  }, [serverData]);

  const syncStatus = useMemo<SyncStatus>(() => {
    return {
      total: serverData?.totalChannels || 0,
      current: serverData?.totalChannels || 0,
      isSyncing: triggerServerRefresh.isPending,
      lastUpdated: serverData?.lastUpdated ? new Date(serverData.lastUpdated).getTime() : Date.now(),
      errors: 0,
    };
  }, [serverData, triggerServerRefresh.isPending]);

  const cacheStatus = useMemo(() => {
    const lastUpdated = serverData?.lastUpdated ? new Date(serverData.lastUpdated).getTime() : 0;
    const age = Date.now() - lastUpdated;
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    return {
      hasCache: !!serverData?.videos?.length,
      isStale: age > CACHE_TTL,
      age,
      videoCount: serverData?.videos?.length || 0,
    };
  }, [serverData]);

  return {
    // Data
    videos,
    cachedVideos: videos,

    // Loading states
    isLoading,
    isFetching: triggerServerRefresh.isPending,
    isCacheLoading: isLoading,
    syncStatus,

    // Error states
    error,
    fetchError: error,
    cacheError: error,

    // Cache status
    cacheStatus,
    isCacheStale: cacheStatus.isStale,

    // Actions
    refresh: () => triggerServerRefresh.mutate(),
    clearCache: async () => {
      queryClient.invalidateQueries({ queryKey: ['server-videos'] });
    },
    cleanupOldCache: async () => {
      // No-op for server-side
    },

    // Mutation states
    isClearing: false,
    isCleaning: false,
  };
};
