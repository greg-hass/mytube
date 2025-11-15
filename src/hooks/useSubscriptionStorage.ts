import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  getAllSubscriptions,
  addSubscriptions,
  removeSubscription,
  clearAllSubscriptions,
  getSubscriptionCount,
  type StoredSubscription,
} from '../lib/indexeddb';
import { parseOPMLToSubscriptions } from '../lib/opml-parser';
import { useStore } from '../store/useStore';
import type { YouTubeChannel } from '../types/youtube';

/**
 * Hook for managing subscriptions in IndexedDB
 * Provides CRUD operations and integrates with React Query for caching
 */
export const useSubscriptionStorage = () => {
  const queryClient = useQueryClient();
  const { searchQuery, sortBy } = useStore();

  // Fetch all subscriptions from IndexedDB
  const {
    data: subscriptions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: getAllSubscriptions,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  // Get subscription count
  const { data: count = 0 } = useQuery({
    queryKey: ['subscriptions-count'],
    queryFn: getSubscriptionCount,
    staleTime: 1000 * 60 * 5,
  });

  // Mutation to import OPML file
  const importOPML = useMutation({
    mutationFn: async (opmlContent: string) => {
      const newSubscriptions = parseOPMLToSubscriptions(opmlContent);
      await addSubscriptions(newSubscriptions);
      return newSubscriptions;
    },
    onSuccess: () => {
      // Invalidate queries to refetch data
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
    },
  });

  // Mutation to add individual subscriptions
  const addSubscriptionsMutation = useMutation({
    mutationFn: async (newSubscriptions: StoredSubscription[]) => {
      await addSubscriptions(newSubscriptions);
      return newSubscriptions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
    },
  });

  // Mutation to remove a subscription
  const removeSubscriptionMutation = useMutation({
    mutationFn: async (channelId: string) => {
      await removeSubscription(channelId);
      return channelId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
      queryClient.invalidateQueries({ queryKey: ['rss-videos'] });
    },
  });

  // Mutation to clear all subscriptions
  const clearAllMutation = useMutation({
    mutationFn: clearAllSubscriptions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
      queryClient.invalidateQueries({ queryKey: ['rss-videos'] });
    },
  });

  // Convert StoredSubscription to YouTubeChannel for compatibility with existing UI
  const channelSubscriptions = useMemo<YouTubeChannel[]>(() => {
    if (!subscriptions) return [];

    return subscriptions.map((sub) => ({
      id: sub.id,
      title: sub.title,
      description: sub.description || '',
      thumbnail: sub.thumbnail || '',
      customUrl: sub.customUrl,
    }));
  }, [subscriptions]);

  // Filter and sort subscriptions
  const filteredAndSortedSubscriptions = useMemo(() => {
    let result = [...channelSubscriptions];

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
          // For recent, we'd ideally sort by addedAt, but we don't have that in YouTubeChannel
          // For now, maintain alphabetical order
          return a.title.localeCompare(b.title);
        case 'oldest':
          return b.title.localeCompare(a.title);
        default:
          return 0;
      }
    });

    return result;
  }, [channelSubscriptions, searchQuery, sortBy]);

  // Export current subscriptions as OPML
  const exportOPML = () => {
    if (!subscriptions || subscriptions.length === 0) {
      throw new Error('No subscriptions to export');
    }

    // Generate OPML XML
    const outlines = subscriptions
      .map(
        (sub) =>
          `      <outline text="${escapeXml(sub.title)}" title="${escapeXml(
            sub.title
          )}" type="rss" xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=${sub.id}" />`
      )
      .join('\n');

    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.1">
  <head>
    <title>YouTube Subscriptions</title>
  </head>
  <body>
    <outline text="YouTube Subscriptions" title="YouTube Subscriptions">
${outlines}
    </outline>
  </body>
</opml>`;

    // Download OPML file
    const blob = new Blob([opml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `youtube-subscriptions-${new Date().toISOString().split('T')[0]}.opml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return {
    // Data
    subscriptions: filteredAndSortedSubscriptions,
    allSubscriptions: channelSubscriptions,
    rawSubscriptions: subscriptions || [],
    count,

    // Loading states
    isLoading,
    error,

    // Mutations
    importOPML: importOPML.mutateAsync,
    addSubscriptions: addSubscriptionsMutation.mutateAsync,
    removeSubscription: removeSubscriptionMutation.mutateAsync,
    clearAll: clearAllMutation.mutateAsync,
    exportOPML,

    // Mutation states
    isImporting: importOPML.isPending,
    isRemoving: removeSubscriptionMutation.isPending,
    isClearing: clearAllMutation.isPending,

    // Refetch
    refetch,
  };
};

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
