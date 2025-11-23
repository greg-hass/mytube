import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from './Header';
import { VideoCard } from './VideoCard';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { generatePlaceholderThumbnail, handleImageLoadError } from '../lib/icon-loader';

export const ChannelViewer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { allSubscriptions } = useSubscriptionStorage();

  if (!channelId) {
    navigate('/');
    return null;
  }

  // Get channel info from subscriptions
  const channelInfo = allSubscriptions.find(sub => sub.id === channelId);

  // Fetch videos for this specific channel
  const { videos, isLoading, error, refresh } = useRSSVideos();

  // If channel info is missing (e.g. ID changed after resolution), try to get it from videos
  const resolvedChannelInfo = channelInfo || (videos.length > 0 ? {
    id: videos[0].channelId,
    title: videos[0].channelTitle,
    thumbnail: videos[0].thumbnail,
    description: '',
    addedAt: 0
  } : undefined);

  // Redirect if we have a resolved ID that matches a subscription but differs from URL
  useEffect(() => {
    if (!channelInfo && videos.length > 0) {
      const resolvedId = videos[0].channelId;
      const matchingSub = allSubscriptions.find(sub => sub.id === resolvedId);
      if (matchingSub && resolvedId !== channelId) {
        console.log(`Redirecting from ${channelId} to resolved ID ${resolvedId}`);
        navigate(`/channel/${resolvedId}`, { replace: true });
      }
    }
  }, [channelInfo, videos, allSubscriptions, channelId, navigate]);

  const openInYouTube = () => {
    window.open(`https://youtube.com/channel/${channelId}`, '_blank');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <Header />
        <div className="max-w-7xl mx-auto py-8 px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-6"
          >
            <p className="text-red-800 dark:text-red-200 text-center">
              ❌ Failed to load videos for this channel
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 text-center mt-2">
              {error.message}
            </p>
            <button
              onClick={() => refresh()}
              className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header />

      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 mb-6 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </motion.button>

        {/* Channel Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden mb-6"
        >
          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-16 h-16">
                <img
                  src={
                    resolvedChannelInfo?.thumbnail ||
                    (resolvedChannelInfo ? generatePlaceholderThumbnail(resolvedChannelInfo.title) : undefined)
                  }
                  alt={resolvedChannelInfo?.title || 'Channel thumbnail'}
                  className="w-16 h-16 rounded-full object-cover bg-gray-200"
                  onError={(e) => {
                    if (resolvedChannelInfo) {
                      handleImageLoadError(e, resolvedChannelInfo.id, resolvedChannelInfo.title);
                    }
                  }}
                  onLoad={() => {
                    // Silent success - no need to log every successful image load
                  }}
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {resolvedChannelInfo?.title || 'Unknown Channel'}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  {videos.length} videos
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Videos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Latest Videos
              </h2>
              <button
                onClick={() => refresh()}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="inline-block w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Loading videos...
                  </p>
                </motion.div>
              ) : videos.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                    No videos found
                  </p>
                  <p className="text-sm text-gray-500">
                    This channel might not have any recent uploads
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="videos"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                >
                  {videos.map((video, index) => (
                    <VideoCard key={video.id} video={video} index={index} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Open in YouTube Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
        >
          <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
            💡 Want more features? Open this channel in YouTube for full functionality.
          </p>
          <button
            onClick={openInYouTube}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors w-full"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open in YouTube</span>
          </button>
        </motion.div>
      </div>
    </div>
  );
};
