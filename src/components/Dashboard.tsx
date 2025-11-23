import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Grid3x3, RefreshCw, Loader2, Activity, Heart, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from './Header';
import { SubscriptionsList } from './SubscriptionsList';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import { VideoCard } from './VideoCard';
import { AddChannelModal } from './AddChannelModal';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import type { YouTubeChannel } from '../types/youtube';

type Tab = 'subscriptions' | 'latest' | 'activity' | 'favorites';

export const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>('subscriptions');
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const { allSubscriptions, addSubscriptions, rawSubscriptions, toggleFavorite } = useSubscriptionStorage();

  // Check if any channels have temporary IDs (can't fetch videos)
  const hasTemporaryChannels = rawSubscriptions.some(sub =>
    sub.id.startsWith('handle_') || sub.id.startsWith('custom_')
  );

  // Get channel IDs for RSS feed fetching
  const channelIds = useMemo(() =>
    allSubscriptions.map(sub => sub.id),
    [allSubscriptions]
  );

  const { videos, isLoading: videosLoading, refresh: refetchVideos, syncStatus } = useRSSVideos({
    channelIds,
    // maxChannels is now handled internally by batching, but we can pass it if we want to limit the TOTAL number of channels to sync
    // For now, we want to sync all of them, so we don't pass maxChannels (or pass a high number if needed)
    autoRefresh: true,
  });

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

  // Calculate favorite channels and their videos
  const favoriteChannels = useMemo(() => {
    return allSubscriptions.filter(sub => sub.isFavorite === true);
  }, [allSubscriptions]);

  const favoriteVideos = useMemo(() => {
    const favoriteChannelIds = new Set(favoriteChannels.map(ch => ch.id));
    return videos.filter(video => favoriteChannelIds.has(video.channelId));
  }, [videos, favoriteChannels]);

  useEffect(() => {
    // Only log significant state changes for debugging
    // Uncomment for development debugging:
    // console.log('🎬 Dashboard mounted with', videos.length, 'videos');
  }, []); // Only run once on mount

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header onAddChannel={() => setIsAddChannelModalOpen(true)} />

      <div className="max-w-7xl mx-auto py-8">
        {/* Tabs */}
        <div className="px-4 mb-8">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'subscriptions'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <Grid3x3 className="w-5 h-5" />
              <span>Subscriptions</span>
              <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded-full">
                {allSubscriptions.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('latest')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'latest'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <TrendingUp className="w-5 h-5" />
              <span>Latest Videos</span>
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'activity'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <Activity className="w-5 h-5" />
              <span>Activity</span>
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-1 rounded-full">
                {activeChannels.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${activeTab === 'favorites'
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                }`}
            >
              <Heart className="w-5 h-5" />
              <span>Favorites</span>
              <span className="text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 px-2 py-1 rounded-full">
                {favoriteChannels.length}
              </span>
            </button>
            {activeTab === 'latest' && (
              <div className="flex items-center gap-2">
                {syncStatus?.isSyncing && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium animate-in fade-in slide-in-from-left-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">
                      Syncing {syncStatus.current}/{syncStatus.total}
                    </span>
                    <span className="sm:hidden">
                      {Math.round((syncStatus.current / syncStatus.total) * 100)}%
                    </span>
                  </div>
                )}
                <button
                  onClick={() => {
                    refetchVideos();
                  }}
                  disabled={videosLoading || syncStatus?.isSyncing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <RefreshCw className={`w-4 h-4 ${videosLoading || syncStatus?.isSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            )}
          </div>
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
                      <p className="text-gray-600 dark:text-gray-400">
                        Loading latest videos from your subscriptions...
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                        Syncing {syncStatus.current}/{syncStatus.total} channels
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Showing {videos.length} recent videos
                  </p>
                  <VirtualizedVideoGrid videos={videos} />
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
              {favoriteChannels.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="w-20 h-20 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                    No favorite channels yet
                  </p>
                  <p className="text-sm text-gray-500">
                    Click the star icon on any channel to add it to your favorites
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                  {/* Left column: Favorite channels list (1 column) */}
                  <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 h-fit xl:sticky xl:top-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                      <Heart className="w-5 h-5 text-pink-500" />
                      Favorite Channels ({favoriteChannels.length})
                    </h3>
                    <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
                      {favoriteChannels.map((channel) => (
                        <div
                          key={channel.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                        >
                          <img
                            src={channel.thumbnail}
                            alt={channel.title}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                              {channel.title}
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              await toggleFavorite(channel.id);
                              toast.success(`Removed ${channel.title} from favorites`);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                            title="Remove from favorites"
                          >
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right column: Videos from favorite channels (3 columns) */}
                  <div className="xl:col-span-3">
                    {favoriteVideos.length === 0 ? (
                      <div className="text-center py-12">
                        <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                          No videos from favorite channels
                        </p>
                        <p className="text-sm text-gray-500">
                          Your favorite channels haven't uploaded recently
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                          Showing {favoriteVideos.length} video{favoriteVideos.length !== 1 ? 's' : ''}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                          {favoriteVideos.map((video, index) => (
                            <VideoCard key={video.id} video={video} index={index} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="activity"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
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
                    <motion.div
                      key={item.channel.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
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
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Channel Modal */}
      <AddChannelModal
        isOpen={isAddChannelModalOpen}
        onClose={() => setIsAddChannelModalOpen(false)}
        onAdd={handleAddChannel}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </div>
  );
};
