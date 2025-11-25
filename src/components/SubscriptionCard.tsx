import { motion } from 'framer-motion';
import { ExternalLink, Users, Video, Trash2, Star, Volume2, VolumeX } from 'lucide-react';
import type { YouTubeChannel } from '../types/youtube';
import { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { generatePlaceholderThumbnail, handleImageLoadError } from '../lib/icon-loader';

interface Props {
  channel: YouTubeChannel;
  index: number;
  onRemove?: (channelId: string) => void;
  onToggleFavorite?: (channelId: string) => void;
  onToggleMute?: (channelId: string) => void;
}

export const SubscriptionCard = memo(({ channel, index, onRemove, onToggleFavorite, onToggleMute }: Props) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const navigate = useNavigate();

  const openChannel = () => {
    navigate(`/channel/${channel.id}`);
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
          src={channel.thumbnail || generatePlaceholderThumbnail(channel.title || channel.id)}
          alt={channel.title}
          loading="lazy"
          onError={(e) => {
            handleImageLoadError(e, channel.id, channel.title);
          }}
          onLoad={() => {
            setImageLoaded(true);
          }}
          className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-110 ${imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Favorite button (top-left, hover only) */}
        {/* Action buttons (top-left, hover only) */}
        <div className="absolute top-2 left-2 flex gap-2 z-10">
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(channel.id);
              }}
              className="p-2 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
              title={channel.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star
                className={`w-5 h-5 transition-all ${channel.isFavorite
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-white'
                  }`}
              />
            </button>
          )}
          {onToggleMute && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute(channel.id);
              }}
              className={`p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 ${channel.isMuted
                ? 'bg-red-600/90 text-white'
                : 'bg-black/50 hover:bg-black/70 text-white'
                }`}
              title={channel.isMuted ? 'Unmute channel' : 'Mute channel'}
            >
              {channel.isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          )}
        </div>

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

        {/* Unsubscribe button (hover only) */}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            className="absolute top-2 right-2 p-2 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 transition-all opacity-0 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1"
            title="Unsubscribe from this channel"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Unsubscribe confirmation (styled modal centered on screen) */}
      {confirmOpen && onRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-72 rounded-xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Unsubscribe?
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Remove <span className="font-medium">{channel.title}</span> from your subscriptions.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(channel.id);
                  setConfirmOpen(false);
                }}
              >
                Unsubscribe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="p-3 sm:p-4">
        <h3 className="font-semibold text-base sm:text-lg mb-2 line-clamp-1 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
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
});

function formatCount(count: string): string {
  const num = parseInt(count);
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return count;
}
