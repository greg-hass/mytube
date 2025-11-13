import { useQuery } from '@tanstack/react-query';
import { youtubeAPI } from '../lib/youtube-api';
import { useStore } from '../store/useStore';
import { useMemo } from 'react';
import type { YouTubeChannel } from '../types/youtube';

export const useSubscriptions = () => {
  const { isAuthenticated, searchQuery, sortBy } = useStore();

  const {
    data: subscriptions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => youtubeAPI.getSubscriptions(500),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
  });

  const filteredAndSortedSubscriptions = useMemo(() => {
    if (!subscriptions) return [];

    let result: YouTubeChannel[] = [...subscriptions];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (sub) =>
          sub.title.toLowerCase().includes(query) ||
          sub.description.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title);
        case 'recent':
          // If we had subscription dates, we'd sort by those
          return a.title.localeCompare(b.title);
        case 'oldest':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });

    return result;
  }, [subscriptions, searchQuery, sortBy]);

  return {
    subscriptions: filteredAndSortedSubscriptions,
    allSubscriptions: subscriptions || [],
    isLoading,
    error,
    refetch,
  };
};
