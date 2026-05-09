import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Grid3x3, RefreshCw, Loader2, Activity, Heart, CheckCircle2, Image, ListVideo } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from './Header';
import { SubscriptionsList } from './SubscriptionsList';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { useFavoriteVideos } from '../hooks/useFavoriteVideos';
import { useQueuedVideos } from '../hooks/useQueuedVideos';
import { useStore } from '../store/useStore';
import { buildVideoFeedIndex, filterIndexedVideos } from '../lib/video-feed-index';
import {
  getVisibleTimelineVideos,
  MOBILE_TIMELINE_INCREMENT,
  MOBILE_TIMELINE_INITIAL_LIMIT,
} from '../lib/timeline-window';
import { getCurrentViewportSize, isCompactMobileViewport } from '../lib/mobile-viewport';
import type { YouTubeChannel } from '../types/youtube';

type Tab = 'subscriptions' | 'latest' | 'queue' | 'activity' | 'favorites';
const DASHBOARD_TABS: Tab[] = ['subscriptions', 'latest', 'queue', 'activity', 'favorites'];
const DEFAULT_TAB: Tab = 'latest';

const isDashboardTab = (value: string | null): value is Tab => {
  return DASHBOARD_TABS.includes(value as Tab);
};

const readDashboardTabFromUrl = (): Tab => {
  if (typeof window === 'undefined') return DEFAULT_TAB;

  const tab = new URLSearchParams(window.location.search).get('tab');
  return isDashboardTab(tab) ? tab : DEFAULT_TAB;
};

const writeDashboardTabToUrl = (tab: Tab) => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const AddChannelModal = lazy(() => import('./AddChannelModal').then((module) => ({ default: module.AddChannelModal })));

export const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() => readDashboardTabFromUrl());
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showShorts, setShowShorts] = useState(true);
  const [hideWatched, setHideWatched] = useState(false);
  const [isMobileTimeline, setIsMobileTimeline] = useState(false);
  const [mobileVideoLimit, setMobileVideoLimit] = useState(MOBILE_TIMELINE_INITIAL_LIMIT);
  const [selectedSubscriptionGroup, setSelectedSubscriptionGroup] = useState('all');
  const [newSubscriptionGroupName, setNewSubscriptionGroupName] = useState('');
  const [customSubscriptionGroups, setCustomSubscriptionGroups] = useState<string[]>([]);
  const [isRepairingIcons, setIsRepairingIcons] = useState(false);
  const { allSubscriptions, addSubscriptions, rawSubscriptions, repairChannelIcons } = useSubscriptionStorage();
  const { favoriteVideoIds, favoriteVideos: savedFavoriteVideos } = useFavoriteVideos();
  const { queuedVideoIds, queuedVideos: savedQueuedVideos, removeQueuedVideo } = useQueuedVideos();
  const { searchQuery, watchedVideos, markAsWatched } = useStore();

  // Check if any channels have temporary IDs (can't fetch videos)
  const hasTemporaryChannels = rawSubscriptions.some(sub =>
    sub.id.startsWith('handle_') || sub.id.startsWith('custom_')
  );

  const { videos, isLoading: videosLoading, refresh: refetchVideos, syncStatus } = useRSSVideos();
  const feedProgressPercent = syncStatus?.total
    ? Math.round((syncStatus.current / syncStatus.total) * 100)
    : 0;
  const channelThumbnails = useMemo(() => {
    return new Map(allSubscriptions.map((channel) => [channel.id, channel.thumbnail]));
  }, [allSubscriptions]);
  const subscriptionGroups = useMemo(() => {
    return Array.from(new Set([
      ...allSubscriptions
        .map((channel) => channel.group?.trim())
        .filter((group): group is string => Boolean(group)),
      ...customSubscriptionGroups,
    ])).sort((a, b) => a.localeCompare(b));
  }, [allSubscriptions, customSubscriptionGroups]);
  const videoFeedIndex = useMemo(() => {
    return buildVideoFeedIndex(videos, allSubscriptions);
  }, [videos, allSubscriptions]);

  const filteredVideos = useMemo(() => {
    return filterIndexedVideos(videoFeedIndex, { searchQuery, showShorts })
      .map((item) => item.video)
      .filter((video) => !hideWatched || !watchedVideos.has(video.id));
  }, [videoFeedIndex, showShorts, searchQuery, hideWatched, watchedVideos]);

  const visibleLatestVideos = useMemo(() => {
    return getVisibleTimelineVideos(filteredVideos, {
      isMobile: isMobileTimeline,
      searchQuery,
      visibleCount: mobileVideoLimit,
    });
  }, [filteredVideos, isMobileTimeline, mobileVideoLimit, searchQuery]);

  // Calculate most active channels in the past week
  // Optimized to reduce re-renders and heavy calculations
  const activeChannels = useMemo(() => {
    if (videos.length === 0) return [];

    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // Group videos by channel and count those from past week
    const channelActivity = new Map<string, { count: number; channel: YouTubeChannel; latestVideo: Date }>();

    // Only process recent videos to avoid iterating over thousands of old videos
    // Assuming videos are somewhat sorted by date, but we'll check the first 500 just in case
    const recentVideos = videos.slice(0, 1000);

    for (const video of recentVideos) {
      const videoDate = new Date(video.publishedAt).getTime();

      // If we hit videos older than a week and we've processed a fair amount, we can stop
      // (This assumes videos are sorted by date descending, which they usually are)
      if (videoDate < oneWeekAgo) continue;

      const existing = channelActivity.get(video.channelId);
      const channel = allSubscriptions.find(sub => sub.id === video.channelId);

      if (channel) {
        if (existing) {
          existing.count++;
          if (videoDate > existing.latestVideo.getTime()) {
            existing.latestVideo = new Date(videoDate);
          }
        } else {
          channelActivity.set(video.channelId, {
            count: 1,
            channel,
            latestVideo: new Date(videoDate)
          });
        }
      }
    }

    // Sort by count and take top 20
    return Array.from(channelActivity.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [videos, allSubscriptions]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      description: 'Focus search',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
      },
    },
    {
      key: 'n',
      ctrl: true,
      description: 'Add new channel',
      action: () => setIsAddChannelModalOpen(true),
    },
    {
      key: 'Escape',
      description: 'Close modal',
      action: () => {
        setIsAddChannelModalOpen(false);
        setShowShortcutsHelp(false);
      },
    },
    {
      key: '?',
      description: 'Show keyboard shortcuts',
      action: () => setShowShortcutsHelp(true),
    },
  ]);

  const favoriteVideos = useMemo(() => {
    const currentVideosById = new Map(videos.map((video) => [video.id, video]));
    const favoritesById = new Map(savedFavoriteVideos.map((video) => [
      video.id,
      currentVideosById.get(video.id) ?? video,
    ]));

    for (const video of videos) {
      if (favoriteVideoIds.has(video.id) && !favoritesById.has(video.id)) {
        favoritesById.set(video.id, video);
      }
    }

    return Array.from(favoritesById.values()).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [videos, favoriteVideoIds, savedFavoriteVideos]);

  const queuedVideos = useMemo(() => {
    const currentVideosById = new Map(videos.map((video) => [video.id, video]));
    const queuedById = new Map(savedQueuedVideos.map((video) => [
      video.id,
      currentVideosById.get(video.id) ?? video,
    ]));

    for (const video of videos) {
      if (queuedVideoIds.has(video.id) && !queuedById.has(video.id)) {
        queuedById.set(video.id, video);
      }
    }

    return Array.from(queuedById.values());
  }, [videos, queuedVideoIds, savedQueuedVideos]);

  useEffect(() => {
    for (const videoId of queuedVideoIds) {
      if (watchedVideos.has(videoId)) {
        removeQueuedVideo(videoId);
      }
    }
  }, [queuedVideoIds, watchedVideos, removeQueuedVideo]);

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    writeDashboardTabToUrl(tab);

    if (tab === 'favorites') {
      sessionStorage.removeItem('favorite-videos-scroll');
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
      });
    }

    if (tab === 'queue') {
      sessionStorage.removeItem('queued-videos-scroll');
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
      });
    }
  };

  const createSubscriptionGroup = () => {
    const group = newSubscriptionGroupName.trim();
    if (!group) return;

    setCustomSubscriptionGroups((groups) => Array.from(new Set([...groups, group])).sort((a, b) => a.localeCompare(b)));
    setNewSubscriptionGroupName('');
    toast.success(`Created ${group} group`);
  };

  const handleRepairChannelIcons = async () => {
    setIsRepairingIcons(true);
    try {
      const repairedCount = await repairChannelIcons({ useApi: true });
      toast.success(
        repairedCount > 0
          ? `Updated ${repairedCount} channel icon${repairedCount === 1 ? '' : 's'}`
          : 'Channel icons are already up to date'
      );
    } catch (error) {
      toast.error('Could not repair channel icons', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRepairingIcons(false);
    }
  };

  useEffect(() => {
    // Only log significant state changes for debugging
    // Uncomment for development debugging:
    // console.log('🎬 Dashboard mounted with', videos.length, 'videos');
  }, []); // Only run once on mount

  useEffect(() => {
    const updateMobileTimeline = () => {
      setIsMobileTimeline(isCompactMobileViewport(getCurrentViewportSize()));
    };

    updateMobileTimeline();

    window.addEventListener('resize', updateMobileTimeline, { passive: true });
    return () => window.removeEventListener('resize', updateMobileTimeline);
  }, []);

  useEffect(() => {
    setMobileVideoLimit(MOBILE_TIMELINE_INITIAL_LIMIT);
  }, [searchQuery, showShorts, hideWatched]);

  // Helper function to format time ago
  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const formatRefreshAge = (timestamp: number) => {
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const scheduledRefreshIntervalMinutes = syncStatus.scheduledRefresh?.enabled
    ? Math.round(syncStatus.scheduledRefresh.intervalMs / 60000)
    : null;

  const handleAddChannel = async (channel: YouTubeChannel) => {
    try {
      await addSubscriptions([{
        id: channel.id,
        title: channel.title,
        description: channel.description,
        thumbnail: channel.thumbnail,
        customUrl: channel.customUrl,
        addedAt: Date.now(),
      }]);
      toast.success(`Added ${channel.title}`, {
        description: 'Channel added to your subscriptions',
      });
    } catch (error) {
      console.error('Error adding channel:', error);
      toast.error('Failed to add channel', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      throw error;
    }
  };

  return (
    <div className="app-shell min-h-screen">
      <Header
        onAddChannel={() => setIsAddChannelModalOpen(true)}
        showMobileSearch={activeTab === 'subscriptions' || activeTab === 'latest' || activeTab === 'queue'}
        searchPlaceholder={activeTab === 'latest' || activeTab === 'queue' ? 'Search videos...' : 'Search channels...'}
      />

      <div
        data-testid="dashboard-page-chrome"
        className="max-w-7xl mx-auto pt-[var(--app-sticky-gap)] pb-3 sm:pt-[var(--app-sticky-gap)] sm:pb-8"
      >
        {/* Tabs */}
        <div
          data-testid="dashboard-tabs"
          className="sticky top-[calc(env(safe-area-inset-top)+var(--app-header-height)+var(--app-sticky-gap))] z-40 px-4 mb-[var(--app-sticky-gap)] pb-[var(--app-sticky-gap)] pt-[var(--app-sticky-gap)] bg-gray-50 dark:bg-gray-950 before:absolute before:bottom-full before:left-0 before:right-0 before:h-[var(--app-sticky-gap)] before:bg-gray-50 dark:before:bg-gray-950"
        >
          <div className="grid grid-cols-5 gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl shadow-sm sm:flex sm:items-center sm:w-fit sm:gap-2">
            <button
              onClick={() => changeTab('subscriptions')}
              className={`flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-xs sm:text-base font-medium transition-all sm:gap-2 sm:px-6 sm:py-3 ${activeTab === 'subscriptions'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <Grid3x3 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Subs</span>
              <span className="hidden sm:inline-flex text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded-full">
                {allSubscriptions.length}
              </span>
            </button>
            <button
              onClick={() => changeTab('latest')}
              className={`flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-xs sm:text-base font-medium transition-all sm:gap-2 sm:px-6 sm:py-3 ${activeTab === 'latest'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Latest</span>
            </button>
            <button
              onClick={() => changeTab('activity')}
              className={`flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-xs sm:text-base font-medium transition-all sm:gap-2 sm:px-6 sm:py-3 ${activeTab === 'activity'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Activity</span>
              <span className="hidden sm:inline-flex text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-1 rounded-full">
                {activeChannels.length}
              </span>
            </button>
            <button
              onClick={() => changeTab('queue')}
              className={`flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-xs sm:text-base font-medium transition-all sm:gap-2 sm:px-6 sm:py-3 ${activeTab === 'queue'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <ListVideo className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Queue</span>
              <span className="hidden sm:inline-flex text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-full">
                {queuedVideos.length}
              </span>
            </button>
            <button
              onClick={() => changeTab('favorites')}
              className={`flex min-w-0 items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-xs sm:text-base font-medium transition-all sm:gap-2 sm:px-6 sm:py-3 ${activeTab === 'favorites'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <Heart className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Faves</span>
              <span className="hidden sm:inline-flex text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-1 rounded-full">
                {favoriteVideos.length}
              </span>
            </button>
          </div>

          {activeTab === 'subscriptions' && (
            <div
              data-testid="subscription-groups-toolbar"
              className="mt-[var(--app-sticky-gap)] flex items-start gap-2 border-b border-gray-200/70 pb-[var(--app-sticky-gap)] dark:border-gray-800/80 sm:items-center"
            >
              <div className="mr-auto flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <label htmlFor="subscription-group-filter" className="sr-only">Filter group</label>
                <select
                  id="subscription-group-filter"
                  aria-label="Filter group"
                  value={selectedSubscriptionGroup}
                  onChange={(e) => setSelectedSubscriptionGroup(e.target.value)}
                  className="h-10 max-w-[11rem] rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
                >
                  <option value="all">All groups</option>
                  {subscriptionGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>

                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createSubscriptionGroup();
                  }}
                >
                  <label htmlFor="new-subscription-group" className="sr-only">New group</label>
                  <input
                    id="new-subscription-group"
                    value={newSubscriptionGroupName}
                    onChange={(e) => setNewSubscriptionGroupName(e.target.value)}
                    placeholder="New group"
                    className="h-10 w-28 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-red-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 sm:w-32"
                  />
                  <button
                    type="submit"
                    className="h-10 rounded-lg bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    Add
                  </button>
                </form>
              </div>
              <button
                disabled={isRepairingIcons}
                onClick={handleRepairChannelIcons}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-800 px-0 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600 sm:w-auto sm:px-3"
                title="Repair icons"
              >
                {isRepairingIcons ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                <span className="hidden sm:inline">{isRepairingIcons ? 'Repairing...' : 'Repair icons'}</span>
              </button>
            </div>
          )}

          {activeTab === 'latest' && (
            <div className="mt-[var(--app-sticky-gap)] flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showShorts}
                    onChange={(e) => setShowShorts(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 dark:peer-focus:ring-red-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-red-600"></div>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Shorts</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={hideWatched}
                    onChange={(e) => setHideWatched(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hide watched</span>
              </label>

              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 sm:flex">
                  <span>Last refreshed {formatRefreshAge(syncStatus.lastUpdated)}</span>
                  {scheduledRefreshIntervalMinutes && (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      Auto {scheduledRefreshIntervalMinutes}m
                    </span>
                  )}
                </div>
                {syncStatus?.isSyncing && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium animate-in fade-in slide-in-from-left-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">
                      {syncStatus.state === 'queued' ? 'Queued' : 'Building'} {syncStatus.current}/{syncStatus.total}
                    </span>
                    <span className="sm:hidden">
                      {feedProgressPercent}%
                    </span>
                  </div>
                )}
                <button
                  onClick={() => {
                    refetchVideos();
                  }}
                  disabled={videosLoading || syncStatus?.isSyncing}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <RefreshCw className={`w-4 h-4 ${videosLoading || syncStatus?.isSyncing ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                {visibleLatestVideos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => visibleLatestVideos.forEach((video) => markAsWatched(video.id))}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Mark shown watched</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'subscriptions' ? (
            <motion.div
              key="subscriptions"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <SubscriptionsList
                selectedGroup={selectedSubscriptionGroup}
                groups={subscriptionGroups}
              />
            </motion.div>
          ) : activeTab === 'latest' ? (
            <motion.div
              key="latest"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4"
            >
              {videos.length === 0 ? (
                <div className="text-center py-12">
                  {syncStatus?.isSyncing ? (
                    <>
                      <div className="inline-block w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
                      <p className="text-gray-800 dark:text-gray-200 text-lg font-semibold">
                        Building your feed
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        {syncStatus.current} / {syncStatus.total} channels checked
                      </p>
                      <div className="w-full max-w-sm h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mx-auto mt-4">
                        <div
                          className="h-full bg-red-600 rounded-full transition-all"
                          style={{ width: `${feedProgressPercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                        {syncStatus.videos} videos found so far
                      </p>
                    </>
                  ) : hasTemporaryChannels ? (
                    <>
                      <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                        Some channels need channel IDs to fetch videos
                      </p>
                      <p className="text-sm text-gray-500">
                        Channels added with handles or custom names will be updated automatically when videos are discovered
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                        No videos found
                      </p>
                      <p className="text-sm text-gray-500">
                        Make sure you have subscriptions with recent uploads
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  {syncStatus?.isSyncing && (
                    <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                            Building your feed
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            {syncStatus.current} / {syncStatus.total} channels checked, {syncStatus.videos} videos found
                          </p>
                        </div>
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                          {feedProgressPercent}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${feedProgressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Showing {filteredVideos.length} recent videos
                  </p>
                  <VirtualizedVideoGrid
                    videos={visibleLatestVideos}
                    columns={4}
                    scrollStorageKey="latest-videos-scroll"
                    channelThumbnails={channelThumbnails}
                  />
                  {visibleLatestVideos.length < filteredVideos.length && (
                    <div className="mt-4 flex justify-center pb-8 sm:hidden">
                      <button
                        type="button"
                        onClick={() => setMobileVideoLimit((count) => count + MOBILE_TIMELINE_INCREMENT)}
                        className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white dark:bg-gray-700"
                      >
                        Show older videos
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : activeTab === 'queue' ? (
            <motion.div
              key="queue"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4"
            >
              {queuedVideos.length === 0 ? (
                <div className="text-center py-12">
                  <ListVideo className="w-20 h-20 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                    Queue is empty
                  </p>
                  <p className="text-sm text-gray-500">
                    Add videos from Latest to watch them later
                  </p>
                </div>
              ) : (
                <div>
                  <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {queuedVideos.length} video{queuedVideos.length !== 1 ? 's' : ''} queued
                  </p>
                  <VirtualizedVideoGrid
                    videos={queuedVideos}
                    columns={4}
                    scrollStorageKey="queued-videos-scroll"
                    channelThumbnails={channelThumbnails}
                  />
                </div>
              )}
            </motion.div>
          ) : activeTab === 'favorites' ? (
            <motion.div
              key="favorites"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4"
            >
              {favoriteVideos.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="w-20 h-20 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                    No favorite videos yet
                  </p>
                  <p className="text-sm text-gray-500">
                    Tap the heart on any video to save it here
                  </p>
                </div>
              ) : (
                <div>
                  <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Showing {favoriteVideos.length} favorite video{favoriteVideos.length !== 1 ? 's' : ''}
                  </p>
                  <VirtualizedVideoGrid
                    videos={favoriteVideos}
                    columns={4}
                    scrollStorageKey="favorite-videos-scroll"
                    channelThumbnails={channelThumbnails}
                  />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="activity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="px-4"
            >
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Most Active Channels
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Top {activeChannels.length} channels by uploads in the past 7 days
                </p>
              </div>

              {activeChannels.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                    No activity in the past week
                  </p>
                  <p className="text-sm text-gray-500">
                    Check back after your channels upload new videos
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeChannels.map((item, index) => (
                    <div
                      key={item.channel.id}
                      onClick={() => window.location.href = `/channel/${item.channel.id}`}
                      className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        #{index + 1}
                      </div>
                      <img
                        src={item.channel.thumbnail}
                        alt={item.channel.title}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {item.channel.title}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {item.count} video{item.count !== 1 ? 's' : ''} this week
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Latest upload
                        </p>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {formatTimeAgo(item.latestVideo)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Channel Modal */}
      <Suspense fallback={null}>
        <AddChannelModal
          isOpen={isAddChannelModalOpen}
          onClose={() => setIsAddChannelModalOpen(false)}
          onAdd={handleAddChannel}
        />
      </Suspense>

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </div >
  );
};
