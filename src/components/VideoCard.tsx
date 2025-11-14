import { motion } from 'framer-motion';
import { Play, Clock } from 'lucide-react';
import type { YouTubeVideo } from '../types/youtube';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  video: YouTubeVideo;
  index: number;
}

export const VideoCard = ({ video, index }: Props) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const navigate = useNavigate();

  const openVideo = () => {
    navigate(`/video/${video.id}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      whileHover={{ scale: 1.03 }}
      onClick={openVideo}
      className="group cursor-pointer bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-800"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-200 dark:bg-gray-800 overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800" />
        )}
        <img
          src={video.thumbnail}
          alt={video.title}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            whileHover={{ scale: 1 }}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="bg-red-600 rounded-full p-4">
              <Play className="w-8 h-8 text-white fill-white" />
            </div>
          </motion.div>
        </div>

        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs text-white font-medium">
            {video.duration}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h4 className="font-medium text-sm mb-1 line-clamp-2 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
          {video.title}
        </h4>

        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
          {video.channelTitle}
        </p>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>{formatDate(video.publishedAt)}</span>
        </div>
      </div>
    </motion.div>
  );
};
