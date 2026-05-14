import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { YouTubeVideo } from '../types/youtube';

export interface SyncStatus {
  total: number;
  current: number;
  isSyncing: boolean;
  lastUpdated: number;
  errors: number;
  videos: number;
  state: 'idle' | 'running' | 'queued' | 'error';
  failedChannels: FailedChannelRefresh[];
  scheduledRefresh?: ScheduledRefreshStatus;
}

export interface FailedChannelRefresh {
  id: string;
  title: string;
  reason: string;
  lastSuccessfulFetchAt?: string;
  lastFailedFetchAt?: string;
  consecutiveFailures?: number;
  backoffUntil?: string | null;
}

export interface ScheduledRefreshStatus {
  enabled: boolean;
  intervalMs: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

interface AggregationStatus {
  state: 'idle' | 'running' | 'queued' | 'error';
  current: number;
  total: number;
  videos: number;
  errors: number;
  startedAt: string | null;
  completedAt: string | null;
  lastUpdated: string | null;
  failedChannels?: FailedChannelRefresh[];
  scheduledRefresh?: ScheduledRefreshStatus;
}

/**
 * Hook for fetching videos from the server-side aggregator
 * Provides automatic caching and refresh
 */
export const useRSSVideos = () => {
  const queryClient = useQueryClient();

  const {
    data: aggregationStatus,
  } = useQuery<AggregationStatus>({
    queryKey: ['server-videos-status'],
    queryFn: async () => {
      const response = await fetch(`/api/videos/status?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch video refresh status');
      }
      return response.json();
    },
    staleTime: 0,
    refetchInterval: 2000,
  });

  const isAggregating = aggregationStatus?.state === 'running' || aggregationStatus?.state === 'queued';

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
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: isAggregating ? 5000 : 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!aggregationStatus?.lastUpdated || !serverData?.lastUpdated) return;

    const statusUpdatedAt = new Date(aggregationStatus.lastUpdated).getTime();
    const videosUpdatedAt = new Date(serverData.lastUpdated).getTime();

    if (
      Number.isFinite(statusUpdatedAt) &&
      Number.isFinite(videosUpdatedAt) &&
      statusUpdatedAt > videosUpdatedAt
    ) {
      queryClient.invalidateQueries({ queryKey: ['server-videos'] });
    }
  }, [aggregationStatus?.lastUpdated, queryClient, serverData?.lastUpdated]);

  // Trigger server-side refresh
  const triggerServerRefresh = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/videos/refresh', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to trigger server refresh');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['server-videos-status'] });
    },
    onError: (error) => {
      toast.error(`Refresh failed: ${error.message}`);
    }
  });

  const videos = useMemo<YouTubeVideo[]>(() => {
    if (!serverData?.videos) return [];
    return serverData.videos;
  }, [serverData]);

  const syncStatus = useMemo<SyncStatus>(() => {
    const state = aggregationStatus?.state || 'idle';
    const current = aggregationStatus?.current ?? serverData?.totalChannels ?? 0;
    const total = aggregationStatus?.total ?? serverData?.totalChannels ?? 0;
    const videosCount = aggregationStatus?.videos ?? serverData?.videos?.length ?? 0;
    const lastUpdated = aggregationStatus?.lastUpdated || serverData?.lastUpdated;

    return {
      total,
      current,
      isSyncing: triggerServerRefresh.isPending || state === 'running' || state === 'queued',
      lastUpdated: lastUpdated ? new Date(lastUpdated).getTime() : Date.now(),
      errors: aggregationStatus?.errors || 0,
      videos: videosCount,
      state,
      failedChannels: aggregationStatus?.failedChannels || [],
      scheduledRefresh: aggregationStatus?.scheduledRefresh,
    };
  }, [aggregationStatus, serverData, triggerServerRefresh.isPending]);

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
