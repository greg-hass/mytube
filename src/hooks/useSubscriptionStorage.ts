import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  getAllSubscriptions,
  addSubscriptions,
  removeSubscription,
  clearAllSubscriptions,
  getSubscriptionCount,
  toggleFavorite,
  type StoredSubscription,
} from '../lib/indexeddb';
import { parseOPMLToSubscriptions } from '../lib/opml-parser';
import { resolveChannelThumbnail } from '../lib/icon-loader';
import { useStore } from '../store/useStore';
import type { YouTubeChannel } from '../types/youtube';
import { toast } from 'sonner';

/**
 * Hook for managing subscriptions in IndexedDB
 * Provides CRUD operations and integrates with React Query for caching
 */
export const useSubscriptionStorage = () => {
  const queryClient = useQueryClient();
  const { searchQuery, sortBy, apiKey } = useStore();

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
      isFavorite: sub.isFavorite,
    }));
  }, [subscriptions]);

  // Backfill missing channel thumbnails
  // If API key is present, we can also refresh existing thumbnails to ensure high quality
  useEffect(() => {
    if (!subscriptions || subscriptions.length === 0) return;

    let isCancelled = false;

    const hydrateThumbnails = async () => {
      // If we have an API key, we can batch fetch everything efficiently
      if (apiKey) {
        // Find channels that need updates (missing thumbnail or low res/placeholder)
        // Or just update everything if it's been a while? For now, let's prioritize missing ones
        // but also update placeholders.
        const needsUpdate = subscriptions.filter(sub =>
          !sub.thumbnail ||
          sub.thumbnail.startsWith('data:') ||
          sub.thumbnail.includes('mqdefault') // Upgrade to high res
        );

        if (needsUpdate.length === 0) return;

        // Process in chunks of 50
        const idsToFetch = needsUpdate.map(sub => sub.id);

        // Import dynamically to avoid circular dependency issues if any
        const { fetchChannelsBatch } = await import('../lib/youtube-api');

        const updatedChannels = await fetchChannelsBatch(idsToFetch, apiKey);

        if (isCancelled) return;

        if (updatedChannels.length > 0) {
          const updates: StoredSubscription[] = [];

          for (const channel of updatedChannels) {
            const original = subscriptions.find(s => s.id === channel.id);
            if (original && original.thumbnail !== channel.thumbnail) {
              updates.push({
                ...original,
                thumbnail: channel.thumbnail,
                description: channel.description || original.description,
                // Update title too if it changed? Maybe safer to keep user's title if they edited it?
                // But usually they don't edit it. Let's update it.
                title: channel.title || original.title
              });
            }
          }

          if (updates.length > 0) {
            await addSubscriptions(updates);
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
          }
        }
      } else {
        // Fallback to scraping for missing thumbnails only
        const missingThumbnails = subscriptions.filter((sub) => !sub.thumbnail);
        if (missingThumbnails.length === 0) return;

        const updates: StoredSubscription[] = [];

        for (const sub of missingThumbnails) {
          const thumbnail = await resolveChannelThumbnail(sub.id);

          if (isCancelled) return;

          if (thumbnail) {
            updates.push({ ...sub, thumbnail });
          }
        }

        if (!isCancelled && updates.length > 0) {
          await addSubscriptions(updates);
          queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        }
      }
    };

    void hydrateThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [subscriptions, queryClient, apiKey]);

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

  // Export subscriptions as JSON (includes all data)
  const exportJSON = () => {
    if (!subscriptions || subscriptions.length === 0) {
      throw new Error('No subscriptions to export');
    }

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      subscriptions: subscriptions,
      settings: {
        apiKey: useStore.getState().apiKey,
        useApiForVideos: useStore.getState().useApiForVideos,
      },
      watchedVideos: Array.from(useStore.getState().watchedVideos),
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `youtube-subscriptions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import subscriptions from JSON
  const importJSON = async (jsonContent: string) => {
    try {
      const data = JSON.parse(jsonContent);

      // Validate structure
      if (!data.subscriptions || !Array.isArray(data.subscriptions)) {
        throw new Error('Invalid JSON format: missing subscriptions array');
      }

      // Import subscriptions
      await addSubscriptions(data.subscriptions);

      // Optionally restore settings
      if (data.settings) {
        if (data.settings.apiKey) {
          useStore.getState().setApiKey(data.settings.apiKey);
        }
        if (typeof data.settings.useApiForVideos === 'boolean') {
          const currentState = useStore.getState().useApiForVideos;
          if (currentState !== data.settings.useApiForVideos) {
            useStore.getState().toggleUseApiForVideos();
          }
        }
      }

      // Restore watched videos
      if (data.watchedVideos && Array.isArray(data.watchedVideos)) {
        data.watchedVideos.forEach((videoId: string) => {
          useStore.getState().markAsWatched(videoId);
        });
      }

      return data.subscriptions.length;
    } catch (error) {
      throw new Error(`Failed to import JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Refresh all channel details (thumbnails, titles, etc.) using API
  const refreshAllChannels = async () => {
    if (!subscriptions || subscriptions.length === 0 || !apiKey) return;

    const realIds: string[] = [];
    const tempSubscriptions: StoredSubscription[] = [];

    subscriptions.forEach(sub => {
      if (sub.id.startsWith('UC')) {
        realIds.push(sub.id);
      } else if (sub.id.startsWith('handle_') || sub.id.startsWith('custom_')) {
        tempSubscriptions.push(sub);
      }
    });

    const { fetchChannelsBatch, fetchChannelInfo } = await import('../lib/youtube-api');

    const updates: StoredSubscription[] = [];
    const removals: string[] = [];

    // 1. Batch fetch real IDs
    if (realIds.length > 0) {
      const updatedRealChannels = await fetchChannelsBatch(realIds, apiKey);

      for (const channel of updatedRealChannels) {
        const original = subscriptions.find(s => s.id === channel.id);
        if (original) {
          updates.push({
            ...original,
            thumbnail: channel.thumbnail,
            title: channel.title,
            description: channel.description || original.description,
            customUrl: channel.customUrl || original.customUrl
          });
        }
      }
    }

    // 2. Resolve temporary IDs one by one
    for (const sub of tempSubscriptions) {
      let inputType: 'handle' | 'custom_url';
      let inputValue: string;

      if (sub.id.startsWith('handle_')) {
        inputType = 'handle';
        inputValue = sub.id.replace('handle_', '');
      } else {
        inputType = 'custom_url';
        inputValue = sub.id.replace('custom_', '');
      }

      try {
        const channelInfo = await fetchChannelInfo({
          type: inputType,
          value: inputValue,
          originalInput: inputValue
        }, apiKey);

        if (channelInfo) {
          // We found the real channel!
          removals.push(sub.id);

          // Check if the real ID already exists to avoid duplicates
          const existingRealSub = subscriptions.find(s => s.id === channelInfo.id);

          if (existingRealSub) {
            // Update existing real subscription
            updates.push({
              ...existingRealSub,
              thumbnail: channelInfo.thumbnail,
              title: channelInfo.title,
              description: channelInfo.description,
              customUrl: channelInfo.customUrl
            });
          } else {
            // Create new subscription with real ID, preserving user settings
            updates.push({
              id: channelInfo.id,
              title: channelInfo.title,
              description: channelInfo.description || '',
              thumbnail: channelInfo.thumbnail || '',
              customUrl: channelInfo.customUrl,
              addedAt: sub.addedAt
            });
          }
        }
      } catch (error) {
        console.error(`Failed to resolve temporary ID ${sub.id}:`, error);
      }
    }

    // Apply changes
    if (removals.length > 0) {
      for (const id of removals) {
        await removeSubscription(id);
      }
    }

    if (updates.length > 0) {
      await addSubscriptions(updates);
    }

    if (removals.length > 0 || updates.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    }
  };

  // Sync with backend
  const syncWithBackend = async () => {
    try {
      // 1. Fetch Remote Data
      const response = await fetch('/api/sync');
      if (!response.ok) throw new Error('Failed to fetch from backend');

      const remoteData = await response.json();
      const remoteSubs = remoteData.subscriptions || [];
      const remoteWatched = remoteData.watchedVideos || [];
      const redirects = remoteData.redirects || {};

      // 2.5 Apply Redirects to Local Data
      // If server says "handle_X" is now "UC_Y", we update our local list immediately
      // This prevents us from pushing "handle_X" back to the server
      let localSubs = [...get().allSubscriptions];
      let localRedirectsApplied = false;

      if (Object.keys(redirects).length > 0) {
        localSubs = localSubs.map(sub => {
          if (redirects[sub.id]) {
            console.log(`🔀 Applying redirect: ${sub.id} -> ${redirects[sub.id]}`);
            localRedirectsApplied = true;
            return { ...sub, id: redirects[sub.id] };
          }
          return sub;
        });

        // After renaming, we might have duplicates (e.g. we had both handle_X and UC_Y)
        // Deduplicate local list, preferring the one with more info or just the first one
        const uniqueLocal = new Map<string, StoredSubscription>();
        localSubs.forEach(sub => {
          if (!uniqueLocal.has(sub.id)) {
            uniqueLocal.set(sub.id, sub);
          }
        });
        localSubs = Array.from(uniqueLocal.values());

        if (localRedirectsApplied) {
          // Update state immediately so the merge uses clean data
          set({ allSubscriptions: localSubs });
        }
      }

      // 3. Merge Logic (Union)
      // We want to keep all subscriptions from both sides.
      const mergedSubsMap = new Map<string, StoredSubscription>();

      // Add local subs first
      localSubs.forEach(sub => mergedSubsMap.set(sub.id, sub));

      // Add remote subs (if not exists, or if we want to merge properties)
      // For now, we'll assume if it exists in both, local is "newer" or equal, so we keep local.
      // But if remote has something local doesn't, we add it.
      remoteSubs.forEach((sub: StoredSubscription) => {
        if (!mergedMap.has(sub.id)) {
          mergedMap.set(sub.id, sub);
        }
      });

      const mergedSubs = Array.from(mergedMap.values());

      // Merge Watched Videos
      const remoteWatched = remoteData.watchedVideos || [];
      const localWatched = Array.from(useStore.getState().watchedVideos);
      const mergedWatched = new Set([...localWatched, ...remoteWatched]);

      // 3. Update Local if needed
      // If merged list has more items than local, we found new stuff from server!
      let updatedLocal = false;

      if (mergedSubs.length > localSubs.length) {
        console.log(`📥 Importing ${mergedSubs.length - localSubs.length} new channels from server...`);
        toast.loading('Syncing new channels from server...');

        // We can just overwrite local with the merged list to be safe
        await clearAllSubscriptions();
        await addSubscriptions(mergedSubs);

        queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
        updatedLocal = true;
      }

      if (mergedWatched.size > localWatched.length) {
        console.log(`📥 Importing ${mergedWatched.size - localWatched.length} watched videos from server...`);
        useStore.getState().setWatchedVideos(Array.from(mergedWatched));
        updatedLocal = true;
      }

      // Sync Settings (API Key, etc.)
      if (remoteData.settings) {
        const { apiKey: currentApiKey, useApiForVideos } = useStore.getState();
        const remoteSettings = remoteData.settings;

        // If local is empty but remote has it, take remote
        if (!currentApiKey && remoteSettings.apiKey) {
          console.log('📥 Importing API Key from server...');
          useStore.getState().setApiKey(remoteSettings.apiKey);
          updatedLocal = true;
        }

        // Sync other settings if needed
        if (remoteSettings.useApiForVideos !== undefined && remoteSettings.useApiForVideos !== useApiForVideos) {
          // If they differ, toggle local to match remote
          useStore.getState().toggleUseApiForVideos();
        }

        // Sync Quota
        if (remoteSettings.quotaUsed !== undefined) {
          // We trust server's quota usage as it's the one doing the work
          // But we should probably take the max or just take server's?
          // Server is the worker, so server knows best.
          const currentQuota = useStore.getState().quotaUsed;
          if (remoteSettings.quotaUsed > currentQuota) {
            useStore.getState().incrementQuota(remoteSettings.quotaUsed - currentQuota);
          }
        }
      }

      if (updatedLocal) {
        toast.dismiss();
        toast.success('Synced with server!');
      }

      // 4. Update Remote if needed
      // If merged list has more items than remote, or if local had updates (we can't easily tell updates without timestamps, but we can check counts or just push if local > remote)
      // To be safe and ensure server is always up to date with the UNION, we push if the merged set is different from remote set.
      // Simple check: if merged count > remote count, definitely push.

      if (mergedSubs.length > remoteSubs.length || mergedWatched.size > remoteWatched.length) {
        // We push the MERGED list to server, so server becomes the union too.
        const { searchQuery, sortBy, apiKey, useApiForVideos, quotaUsed } = useStore.getState();

        const pushResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptions: mergedSubs,
            settings: {
              searchQuery,
              sortBy,
              apiKey,
              useApiForVideos,
              quotaUsed // Send local quota too
            },
            watchedVideos: Array.from(mergedWatched)
          })
        });

        if (!pushResponse.ok) {
          console.error('Sync push failed:', pushResponse.status);
        } else {
          console.log('✅ Data pushed to server');
        }
      }

    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  // Run sync on mount
  useEffect(() => {
    syncWithBackend();
  }, []);

  // Auto-save to backend when subscriptions or settings change
  const { useApiForVideos } = useStore();

  useEffect(() => {
    if (!isLoading && subscriptions) {
      const timer = setTimeout(() => {
        syncWithBackend();
      }, 2000); // Debounce 2s
      return () => clearTimeout(timer);
    }
  }, [subscriptions, isLoading, apiKey, useApiForVideos]);

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
    toggleFavorite: async (channelId: string) => {
      await toggleFavorite(channelId);
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    exportOPML,
    exportJSON,
    importJSON,
    refreshAllChannels, // Expose new function

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
    .replace(/'/g, '&#39;');
}
