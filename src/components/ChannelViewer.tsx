import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Users, Video as VideoIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from './Header';
import { VideoCard } from './VideoCard';
import { useChannelVideos } from '../hooks/useChannelVideos';

export const ChannelViewer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { videos, channelDetails, isLoading, error } = useChannelVideos(channelId);

  if (!channelId) {
    return <Navigate to="/" replace />;
  }

  const openInYouTube = () => {
    window.open(`https://youtube.com/channel/${channelId}`, '_blank');
  };

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
        {channelDetails && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden mb-8"
          >
            <div className="relative w-full bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-800 dark:to-gray-900 p-8">
              <div className="flex items-center gap-6">
                {channelDetails.thumbnail && (
                  <img
                    src={channelDetails.thumbnail}
                    alt={channelDetails.title}
                    className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-700 shadow-lg"
                  />
                )}
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {channelDetails.title}
                  </h1>
                  {channelDetails.description && (
                    <p className="text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
                      {channelDetails.description}
                    </p>
                  )}
                  <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                    {channelDetails.subscriberCount && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>{formatCount(channelDetails.subscriberCount)} subscribers</span>
                      </div>
                    )}
                    {channelDetails.videoCount && (
                      <div className="flex items-center gap-2">
                        <VideoIcon className="w-4 h-4" />
                        <span>{formatCount(channelDetails.videoCount)} videos</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={openInYouTube}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition-all hover:scale-105 shadow-lg"
                >
                  <ExternalLink className="w-5 h-5" />
                  <span>Open in YouTube</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Videos Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
            Latest Videos
          </h2>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                Loading videos...
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 dark:text-red-400 mb-2">
                Failed to load videos
              </p>
              <p className="text-sm text-gray-500">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                No videos found for this channel
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {videos.map((video, index) => (
                <VideoCard key={video.id} video={video} index={index} />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

function formatCount(count: string): string {
  const num = parseInt(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return count;
}
