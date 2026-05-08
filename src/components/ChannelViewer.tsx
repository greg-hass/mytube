import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from './Header';
import { VirtualizedVideoGrid } from './VirtualizedVideoGrid';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { generatePlaceholderThumbnail, handleImageLoadError } from '../lib/icon-loader';
import { useStore } from '../store/useStore';

export const ChannelViewer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { allSubscriptions } = useSubscriptionStorage();
  const { watchedVideos, markAsWatched } = useStore();
  const [hideWatched, setHideWatched] = useState(false);

  if (!channelId) {
    navigate('/');
    return null;
  }

  // Get channel info from subscriptions
  const channelInfo = allSubscriptions.find(sub => sub.id === channelId);

  // Fetch videos for this specific channel
  const { videos: allVideos, isLoading, error, refresh } = useRSSVideos();

  const channelVideos = useMemo(() => {
    return allVideos
      .filter(v => v.channelId === channelId)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [allVideos, channelId]);

  const videos = useMemo(() => {
    return channelVideos.filter((video) => !hideWatched || !watchedVideos.has(video.id));
  }, [channelVideos, hideWatched, watchedVideos]);

  // If channel info is missing (e.g. ID changed after resolution), try to get it from videos
  const resolvedChannelInfo = channelInfo || (channelVideos.length > 0 ? {
    id: channelVideos[0].channelId,
    title: channelVideos[0].channelTitle,
    thumbnail: channelVideos[0].thumbnail,
    description: '',
    addedAt: 0
  } : undefined);

  // Redirect if we have a resolved ID that matches a subscription but differs from URL
  useEffect(() => {
    if (!channelInfo && channelVideos.length > 0) {
      const resolvedId = channelVideos[0].channelId;
      const matchingSub = allSubscriptions.find(sub => sub.id === resolvedId);
      if (matchingSub && resolvedId !== channelId) {
        console.log(`Redirecting from ${channelId} to resolved ID ${resolvedId}`);
        navigate(`/channel/${resolvedId}`, { replace: true });
      }
    }
  }, [channelInfo, channelVideos, allSubscriptions, channelId, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [channelId]);

  if (error) {
    return (
      <div className="app-shell min-h-screen">
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
    <div className="app-shell min-h-screen">
      <Header />

      <div className="max-w-7xl mx-auto py-3 sm:py-8 px-4">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 sm:mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="mb-4 flex items-center gap-3 sm:mb-6 sm:gap-4"
        >
          <img
            src={
              resolvedChannelInfo?.thumbnail ||
              (resolvedChannelInfo ? generatePlaceholderThumbnail(resolvedChannelInfo.title) : undefined)
            }
            alt={resolvedChannelInfo?.title || 'Channel thumbnail'}
            className="h-14 w-14 flex-none rounded-full bg-gray-200 object-cover sm:h-16 sm:w-16"
            onError={(e) => {
              if (resolvedChannelInfo) {
                handleImageLoadError(e, resolvedChannelInfo.id, resolvedChannelInfo.title);
              }
            }}
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
              {resolvedChannelInfo?.title || 'Unknown Channel'}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              {channelVideos.length} videos
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                Loading videos...
              </p>
            </div>
          ) : channelVideos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                No videos found
              </p>
              <p className="text-sm text-gray-500">
                This channel might not have any recent uploads
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {videos.length} videos
                </p>
                <div className="flex flex-wrap items-center gap-3">
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
                  <button
                    onClick={() => refresh()}
                    disabled={isLoading}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  {videos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => videos.forEach((video) => markAsWatched(video.id))}
                      className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark shown watched</span>
                    </button>
                  )}
                </div>
              </div>
              {videos.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
                    No unwatched videos
                  </p>
                  <p className="text-sm text-gray-500">
                    Turn off Hide watched to see the full channel timeline
                  </p>
                </div>
              ) : (
                <VirtualizedVideoGrid
                  videos={videos}
                  columns={4}
                  channelThumbnails={
                    resolvedChannelInfo
                      ? new Map([[resolvedChannelInfo.id, resolvedChannelInfo.thumbnail]])
                      : undefined
                  }
                />
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
