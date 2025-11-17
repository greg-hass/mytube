import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Grid3x3, RefreshCw } from 'lucide-react';
import { Header } from './Header';
import { SubscriptionsList } from './SubscriptionsList';
import { VideoCard } from './VideoCard';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';

type Tab = 'subscriptions' | 'latest';

export const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>('subscriptions');
  const { allSubscriptions } = useSubscriptionStorage();

  // Get channel IDs for RSS feed fetching
  const channelIds = useMemo(() =>
    allSubscriptions.map(sub => sub.id),
    [allSubscriptions]
  );

  const { videos, isLoading: videosLoading, refresh: refetchVideos } = useRSSVideos({
    channelIds,
    maxChannels: 50,
    autoRefresh: true,
  });

  useEffect(() => {
    console.log('🎬 Dashboard mounted');
    console.log('📊 Videos state:', { count: videos.length, isLoading: videosLoading });
  }, [videos.length, videosLoading]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header />

      <div className="max-w-7xl mx-auto pt-6 pb-8">
        {/* Tabs */}
        <div className="px-4 mb-4">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-900 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'subscriptions'
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
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === 'latest'
                  ? 'bg-white dark:bg-gray-800 shadow-md'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              <span>Latest Videos</span>
            </button>
            {activeTab === 'latest' && (
              <button
                onClick={() => {
                  console.log('🔄 Manual refresh triggered');
                  refetchVideos();
                }}
                disabled={videosLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${videosLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
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
          ) : (
            <motion.div
              key="latest"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="px-4"
            >
              {videosLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Loading latest videos from your subscriptions...
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                    This may take a moment
                  </p>
                </div>
              ) : videos.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                    No videos found
                  </p>
                  <p className="text-sm text-gray-500">
                    Make sure you have subscriptions with recent uploads
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Showing {videos.length} recent videos
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {videos.map((video, index) => (
                      <VideoCard key={video.id} video={video} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
