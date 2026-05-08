import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Grid3x3, RefreshCw, Loader2, Activity, Heart, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from './Header';
import { SubscriptionsList } from './SubscriptionsList';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { useFavoriteVideos } from '../hooks/useFavoriteVideos';
import { useStore } from '../store/useStore';
import { buildVideoFeedIndex, filterIndexedVideos } from '../lib/video-feed-index';
import {
  getVisibleTimelineVideos,
  MOBILE_TIMELINE_INCREMENT,
  MOBILE_TIMELINE_INITIAL_LIMIT,
} from '../lib/timeline-window';
import type { YouTubeChannel } from '../types/youtube';

type Tab = 'subscriptions' | 'latest' | 'activity' | 'favorites';
const AddChannelModal = lazy(() => import('./AddChannelModal').then((module) => ({ default: module.AddChannelModal })));

export const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>('latest');
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showShorts, setShowShorts] = useState(true);
  const [hideWatched, setHideWatched] = useState(false);
  const [isMobileTimeline, setIsMobileTimeline] = useState(false);
  const [mobileVideoLimit, setMobileVideoLimit] = useState(MOBILE_TIMELINE_INITIAL_LIMIT);
  const { allSubscriptions, addSubscriptions, rawSubscriptions } = useSubscriptionStorage();
  const { favoriteVideoIds, favoriteVideos: savedFavoriteVideos } = useFavoriteVideos();
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

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);

    if (tab === 'favorites') {
      sessionStorage.removeItem('favorite-videos-scroll');
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0 });
      });
    }
  };

  useEffect(() => {
    // Only log significant state changes for debugging
    // Uncomment for development debugging:
    // console.log('🎬 Dashboard mounted with', videos.length, 'videos');
  }, []); // Only run once on mount

  useEffect(() => {
    const updateMobileTimeline = () => {
      setIsMobileTimeline(
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(max-width: 639px)').matches
          : window.innerWidth < 640
      );
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
        showMobileSearch={activeTab === 'subscriptions' || activeTab === 'latest'}
        searchPlaceholder={activeTab === 'latest' ? 'Search videos...' : 'Search channels...'}
      />

      <div className="max-w-7xl mx-auto py-3 sm:py-8">
        {/* Tabs */}
        <div
          data-testid="dashboard-tabs"
          className="sticky top-[calc(env(safe-area-inset-top)+4.25rem)] z-40 px-4 mb-3 pb-2 pt-2 bg-gray-50 dark:bg-gray-950 sm:top-[5rem] sm:mb-8"
        >
          <div className="grid grid-cols-4 gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl shadow-sm sm:flex sm:items-center sm:w-fit sm:gap-2">
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

          {activeTab === 'latest' && (
            <div className="mt-2 flex items-center justify-between gap-3">
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
        <AnimatePresence mode="wait">
          {activeTab === 'subscriptions' ? (
            <motion.div
              key="subscriptions"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <SubscriptionsList />
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
