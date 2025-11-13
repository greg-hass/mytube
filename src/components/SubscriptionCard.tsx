import { motion } from 'framer-motion';
import { ExternalLink, Users, Video } from 'lucide-react';
import type { YouTubeChannel } from '../types/youtube';
import { useState } from 'react';

interface Props {
  channel: YouTubeChannel;
  index: number;
}

export const SubscriptionCard = ({ channel, index }: Props) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  const openChannel = () => {
    window.open(`https://youtube.com/channel/${channel.id}`, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.3 }}
      whileHover={{ y: -8, scale: 1.02 }}
      onClick={openChannel}
      className="group cursor-pointer bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-200 dark:border-gray-800"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-200 dark:bg-gray-800 overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800" />
        )}
        <img
          src={channel.thumbnail}
          alt={channel.title}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-110 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Hover overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-black/40"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileHover={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className="bg-white/90 dark:bg-gray-900/90 rounded-full p-3"
          >
            <ExternalLink className="w-6 h-6 text-red-600" />
          </motion.div>
        </motion.div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-2 line-clamp-1 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
          {channel.title}
        </h3>

        {channel.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
            {channel.description}
          </p>
        )}

        {(channel.subscriberCount || channel.videoCount) && (
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
            {channel.subscriberCount && (
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{formatCount(channel.subscriberCount)}</span>
              </div>
            )}
            {channel.videoCount && (
              <div className="flex items-center gap-1">
                <Video className="w-4 h-4" />
                <span>{formatCount(channel.videoCount)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

function formatCount(count: string): string {
  const num = parseInt(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return count;
}
