import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAllSubscriptions,
  addSubscriptions,
  removeSubscription,
  clearAllSubscriptions,
  getSubscriptionCount,
  toggleFavorite,
  toggleMute,
  setSubscriptionGroup as setStoredSubscriptionGroup,
  type StoredSubscription,
} from '../lib/indexeddb';
import { parseSubscriptionImportToSubscriptions } from '../lib/opml-parser';
import { resolveChannelThumbnail } from '../lib/icon-loader';
import {
  areStringSetsEqual,
  applySubscriptionTombstones,
  hasPlaceholderThumbnail,
  mergeRemoteSubscriptionMetadata,
  resolveWatchedVideoSync,
} from '../lib/subscription-sync';
import { useStore } from '../store/useStore';
import type { YouTubeChannel } from '../types/youtube';
import { toast } from 'sonner';

/**
 * Hook for managing subscriptions in IndexedDB
 * Provides CRUD operations and integrates with React Query for caching
 */
export const useSubscriptionStorage = () => {
  const queryClient = useQueryClient();
  const { searchQuery, sortBy, apiKey, watchedVideos } = useStore();
  const hasCompletedInitialSyncRef = useRef(false);
  const [isInitialSyncing, setIsInitialSyncing] = useState(true);

  const getSubscriptionsWithServerMetadata = async () => {
    const localSubs = await getAllSubscriptions();

    try {
      const response = await fetch(`/api/sync?t=${Date.now()}`);
      if (!response.ok) return localSubs;

      const remoteData = await response.json();
      const tombstones = Array.isArray(remoteData.subscriptionTombstones)
        ? remoteData.subscriptionTombstones
        : [];
      const remoteSubs = applySubscriptionTombstones(remoteData.subscriptions || [], tombstones);
      const locallyMergedSubs = mergeRemoteSubscriptionMetadata(localSubs, remoteSubs);
      const localIds = new Set(locallyMergedSubs.map((sub) => sub.id));
      const mergedSubs = [
        ...locallyMergedSubs,
        ...remoteSubs.filter((sub: StoredSubscription) => !localIds.has(sub.id)),
      ];

      const localStr = JSON.stringify([...localSubs].sort((a, b) => a.id.localeCompare(b.id)));
      const mergedStr = JSON.stringify([...mergedSubs].sort((a, b) => a.id.localeCompare(b.id)));

      if (localStr !== mergedStr) {
        await addSubscriptions(mergedSubs);
      }

      return mergedSubs;
    } catch (error) {
      console.warn('Failed to load server subscription metadata:', error);
      return localSubs;
    }
  };

  // Fetch all subscriptions from IndexedDB
  const {
    data: subscriptions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: getSubscriptionsWithServerMetadata,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  // Get subscription count
  const { data: count = 0 } = useQuery({
    queryKey: ['subscriptions-count'],
    queryFn: getSubscriptionCount,
    staleTime: 1000 * 60 * 5,
  });

  // Mutation to import OPML or Google Takeout CSV file
  const importOPML = useMutation({
    mutationFn: async (importContent: string) => {
      const newSubscriptions = parseSubscriptionImportToSubscriptions(importContent);
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
    onSuccess: async (removedChannelId: string) => {
      // Update the subscriptions cache directly
      queryClient.setQueryData<StoredSubscription[]>(['subscriptions'], (oldSubscriptions) => {
        if (!oldSubscriptions) return [];
        return oldSubscriptions.filter(sub => sub.id !== removedChannelId);
      });

      // Decrement the subscription count
      queryClient.setQueryData<number>(['subscriptions-count'], (oldCount) => {
        return (oldCount || 0) - 1;
      });

      // Invalidate RSS videos, as the list of subscriptions has changed
      queryClient.invalidateQueries({ queryKey: ['rss-videos'] });

      // Push the post-delete local list directly. A normal sync would fetch the
      // server first and merge the deleted channel straight back in.
      await pushLocalStateToBackend();
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
      isMuted: sub.isMuted,
      group: sub.group,
    }));
  }, [subscriptions]);

  // Backfill missing channel thumbnails without spending API quota.
  useEffect(() => {
    if (!subscriptions || subscriptions.length === 0) return;

    let isCancelled = false;

    const hydrateThumbnails = async () => {
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
    };

    void hydrateThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [subscriptions, queryClient]);

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

  const repairChannelIcons = useCallback(async ({ useApi = false }: { useApi?: boolean } = {}) => {
    const localSubs = await getAllSubscriptions();
    let repairedSubs = localSubs;

    try {
      const response = await fetch(`/api/sync?t=${Date.now()}`);
      if (!response.ok) throw new Error('Failed to fetch server subscriptions');

      const remoteData = await response.json();
      const tombstones = Array.isArray(remoteData.subscriptionTombstones)
        ? remoteData.subscriptionTombstones
        : [];
      const remoteSubs = applySubscriptionTombstones(remoteData.subscriptions || [], tombstones);
      repairedSubs = mergeRemoteSubscriptionMetadata(localSubs, remoteSubs);
    } catch (error) {
      if (!useApi) throw error;
      console.warn('Server icon repair unavailable, trying API repair:', error);
    }

    if (useApi && apiKey) {
      const channelIds = Array.from(new Set(
        repairedSubs
          .map((sub) => sub.id)
          .filter((id) => id.startsWith('UC'))
      ));

      if (channelIds.length > 0) {
        const { fetchChannelIconsBatch } = await import('../lib/youtube-api');
        const apiChannels = await fetchChannelIconsBatch(channelIds, apiKey);
        const apiChannelsById = new Map(apiChannels.map((channel) => [channel.id, channel]));

        repairedSubs = repairedSubs.map((sub) => {
          const apiChannel = apiChannelsById.get(sub.id);
          if (!apiChannel?.thumbnail) return sub;

          return {
            ...sub,
            title: apiChannel.title || sub.title,
            description: apiChannel.description || sub.description,
            thumbnail: apiChannel.thumbnail,
            customUrl: apiChannel.customUrl || sub.customUrl,
          };
        });
      }
    }

    const localStr = JSON.stringify([...localSubs].sort((a, b) => a.id.localeCompare(b.id)));
    const repairedStr = JSON.stringify([...repairedSubs].sort((a, b) => a.id.localeCompare(b.id)));

    if (localStr !== repairedStr) {
      await addSubscriptions(repairedSubs);
      queryClient.setQueryData(['subscriptions'], repairedSubs);
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
      return repairedSubs.filter((sub) => {
        const original = localSubs.find((localSub) => localSub.id === sub.id);
        return original?.thumbnail !== sub.thumbnail;
      }).length;
    }

    return 0;
  }, [apiKey, queryClient]);

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
      settings: {},
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
              addedAt: sub.addedAt,
              isFavorite: sub.isFavorite,
              isMuted: sub.isMuted,
              group: sub.group,
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
  const pushLocalStateToBackend = async () => {
    const localSubs = await getAllSubscriptions();
    const { searchQuery, sortBy, quotaUsed } = useStore.getState();

    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriptions: localSubs,
        settings: {
          searchQuery,
          sortBy,
          quotaUsed,
        },
        watchedVideos: Array.from(useStore.getState().watchedVideos),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to push local subscriptions: ${response.status}`);
    }
  };

  const syncWithBackend = useCallback(async ({ importRemoteWatched = false }: { importRemoteWatched?: boolean } = {}) => {
    try {
      // 1. Fetch Remote Data
      const response = await fetch(`/api/sync?t=${Date.now()}`);
      if (!response.ok) throw new Error('Failed to fetch from backend');

      const remoteData = await response.json();
      const tombstones = Array.isArray(remoteData.subscriptionTombstones)
        ? remoteData.subscriptionTombstones
        : [];
      const remoteSubs = applySubscriptionTombstones(remoteData.subscriptions || [], tombstones);
      const remoteWatched = remoteData.watchedVideos || [];
      const redirects = remoteData.redirects || {};

      // 2.5 Apply Redirects to Local Data
      // If server says "handle_X" is now "UC_Y", we update our local list immediately
      // This prevents us from pushing "handle_X" back to the server
      const storedLocalSubs = await getAllSubscriptions();
      let localSubs = applySubscriptionTombstones(storedLocalSubs, tombstones);
      let localRedirectsApplied = false;
      const localTombstonesApplied = localSubs.length !== storedLocalSubs.length;

      if (localTombstonesApplied) {
        await clearAllSubscriptions();
        await addSubscriptions(localSubs);
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
      }

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
          await clearAllSubscriptions();
          await addSubscriptions(localSubs);
          queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        }
      }

      // 3. Merge Logic (Union)
      // We want to keep all subscriptions from both sides.
      const mergedSubsMap = new Map<string, StoredSubscription>();

      // Add local subs first
      localSubs.forEach(sub => mergedSubsMap.set(sub.id, sub));

      // Add remote subs and merge metadata
      remoteSubs.forEach((remoteSub: StoredSubscription) => {
        const localSub = mergedSubsMap.get(remoteSub.id);
        if (localSub) {
          // If exists locally, merge metadata from server (server is source of truth for title/thumbnail)
          // But keep local 'publishedAt' or other user-specific fields if we had them
          mergedSubsMap.set(remoteSub.id, {
            ...localSub,
            title: remoteSub.title || localSub.title,
            thumbnail: remoteSub.thumbnail || localSub.thumbnail,
            description: remoteSub.description || localSub.description,
          });
        } else {
          mergedSubsMap.set(remoteSub.id, remoteSub);
        }
      });

      const mergedSubs = Array.from(mergedSubsMap.values());

      // Merge Watched Videos
      const localWatched = Array.from(useStore.getState().watchedVideos);
      const mergedWatched = resolveWatchedVideoSync(localWatched, remoteWatched, {
        importRemote: importRemoteWatched,
      });

      // 3. Update Local if needed
      // We should update local if there are ANY differences, or just always update to be safe and ensure metadata sync.
      // Since we merged server metadata above, 'mergedSubs' now contains the latest thumbnails.
      // We'll compare JSON stringified to see if we need to write to DB (optimization), or just write.
      // Writing 200 items to IndexedDB is fast. Let's just do it if we have remote data.

      let updatedLocal = false;
      const localStr = JSON.stringify(localSubs.sort((a, b) => a.id.localeCompare(b.id)));
      const mergedStr = JSON.stringify(mergedSubs.sort((a, b) => a.id.localeCompare(b.id)));

      if (localStr !== mergedStr) {
        console.log(`📥 Syncing changes from server (metadata or new channels)...`);

        // We can just overwrite local with the merged list
        await clearAllSubscriptions();
        await addSubscriptions(mergedSubs);

        queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptions-count'] });
        updatedLocal = true;
      }

      if (importRemoteWatched && !areStringSetsEqual(mergedWatched, localWatched)) {
        console.log(`📥 Importing ${mergedWatched.length - localWatched.length} watched videos from server...`);
        useStore.getState().setWatchedVideos(mergedWatched);
        updatedLocal = true;
      }

      // Sync Settings (API Key, etc.)
      if (remoteData.settings) {
        const remoteSettings = remoteData.settings;

        // Sync Quota
        if (remoteSettings.quotaUsed !== undefined) {
          // We trust server's quota usage as it's the one doing the work
          // But we should probably take the max or just take server's?
          // Server is the worker, so server knows best.
          const currentQuota = useStore.getState().quotaUsed;
          if (remoteSettings.quotaUsed > currentQuota) {
            useStore.getState().setQuota(remoteSettings.quotaUsed);

            // Alert user about quota status
            if (remoteSettings.quotaUsed >= 10000) {
              toast.error('API Quota Exceeded! Video updates paused until midnight PT.');
            } else if (remoteSettings.quotaUsed >= 8000 && currentQuota < 8000) {
              toast.warning(`API Quota at ${Math.round(remoteSettings.quotaUsed / 100)}%`);
            }
          }
        }

        // Sync API Exhausted Status
        if (remoteSettings.apiExhausted !== undefined) {
          useStore.getState().setApiExhausted(remoteSettings.apiExhausted);
        }
      }

      if (updatedLocal) {
        toast.dismiss();
        toast.success('Synced with server!');
      }

      // 4. Update Remote if needed
      // If merged list has more items than remote, OR if we just deleted something locally (local < remote), we need to push.
      // The previous logic only pushed if merged > remote, which failed for deletions because merged would include the deleted item from remote.

      // We need a way to know if we should push. 
      // If we are in this function, it's either initial load or auto-save.
      // Ideally, deletions should trigger an immediate push (which we added in removeSubscriptionMutation).
      // But here, we need to be careful not to re-import deleted items if the server hasn't been updated yet.

      // However, since we now force-push on delete, the server *should* be up to date.
      // The issue is likely that 'mergedSubs' is combining local (without item) and remote (with item) and adding it back.

      // FIX: If we have a local deletion that hasn't synced, 'mergedSubs' will re-add it.
      // But we can't easily distinguish "deleted locally" from "added remotely on another device".

      // For now, let's trust the server's state for additions, but if we explicitly triggered this sync from a deletion (which calls this function),
      // we might want to force the local state.

      // Actually, the simplest fix for the user's issue "it keeps re-appearing" is that when we delete, we call syncWithBackend().
      // But syncWithBackend() fetches remote first, merges, and THEN pushes.
      // If remote still has the item, it gets merged back in!

      // We need a 'forcePush' option for syncWithBackend to skip the fetch/merge and just overwrite server.

      if (mergedSubs.length !== remoteSubs.length || !areStringSetsEqual(mergedWatched, remoteWatched)) {
        // We push the MERGED list to server, so server becomes the union too.
        const { searchQuery, sortBy, quotaUsed } = useStore.getState();

        const pushResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscriptions: mergedSubs,
            settings: {
              searchQuery,
              sortBy,
              quotaUsed // Send local quota too
            },
            watchedVideos: mergedWatched
            // NOTE: We intentionally don't send 'redirects' - those are server-only
          })
        });

        if (!pushResponse.ok) {
          console.error('Sync push failed:', pushResponse.status);
        } else {
          console.log('✅ Data pushed to server');
        }
      }

      if (importRemoteWatched) {
        hasCompletedInitialSyncRef.current = true;
      }

    } catch (err) {
      console.error('Sync failed:', err);
    }
  }, [queryClient]);

  // Run sync on mount
  useEffect(() => {
    let isMounted = true;

    void syncWithBackend({ importRemoteWatched: true }).finally(() => {
      if (isMounted) {
        setIsInitialSyncing(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [syncWithBackend]);

  useEffect(() => {
    if (!subscriptions?.some(hasPlaceholderThumbnail)) return;

    const timer = setTimeout(() => {
      repairChannelIcons().catch((error) => {
        console.error('Icon repair failed:', error);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [repairChannelIcons, subscriptions]);

  // Auto-save to backend when subscriptions or settings change
  useEffect(() => {
    if (!isLoading && subscriptions) {
      const timer = setTimeout(() => {
        if (!hasCompletedInitialSyncRef.current) return;
        syncWithBackend();
      }, 2000); // Debounce 2s
      return () => clearTimeout(timer);
    }
  }, [apiKey, isLoading, subscriptions, syncWithBackend, watchedVideos]);

  return {
    // Data
    subscriptions: filteredAndSortedSubscriptions,
    allSubscriptions: channelSubscriptions,
    rawSubscriptions: subscriptions || [],
    count,

    // Loading states
    isLoading,
    isInitialSyncing,
    error,

    // Mutations
    importOPML: importOPML.mutateAsync,
    addSubscriptions: addSubscriptionsMutation.mutateAsync,
    removeSubscription: removeSubscriptionMutation.mutateAsync,
    clearAll: clearAllMutation.mutateAsync,
    toggleFavorite: async (channelId: string) => {
      await toggleFavorite(channelId);
      const current = queryClient.getQueryData<StoredSubscription[]>(['subscriptions']);
      if (current) {
        const updated = current.map((sub) =>
          sub.id === channelId ? { ...sub, isFavorite: !sub.isFavorite } : sub
        );
        queryClient.setQueryData(['subscriptions'], updated);
      }
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    toggleMute: async (channelId: string) => {
      await toggleMute(channelId);
      // Optimistically update the cached subscriptions to reflect mute state change
      const current = queryClient.getQueryData<StoredSubscription[]>(['subscriptions']);
      if (current) {
        const updated = current.map((sub) =>
          sub.id === channelId ? { ...sub, isMuted: !sub.isMuted } : sub
        );
        queryClient.setQueryData(['subscriptions'], updated);
      }
      // Also invalidate to ensure fresh fetch later
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    setSubscriptionGroup: async (channelId: string, group: string) => {
      await setStoredSubscriptionGroup(channelId, group);
      const current = queryClient.getQueryData<StoredSubscription[]>(['subscriptions']);
      if (current) {
        const trimmedGroup = group.trim();
        const updated = current.map((sub) =>
          sub.id === channelId
            ? { ...sub, group: trimmedGroup || undefined }
            : sub
        );
        queryClient.setQueryData(['subscriptions'], updated);
      }
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    exportOPML,
    exportJSON,
    importJSON,
    refreshAllChannels,
    repairChannelIcons,
    syncWithBackend,

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
