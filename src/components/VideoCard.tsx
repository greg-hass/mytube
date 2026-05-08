import { Play, Clock, Heart, CheckCircle2 } from 'lucide-react';
import type { YouTubeVideo } from '../types/youtube';
import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDisplayThumbnail } from '../lib/icon-loader';
import { useFavoriteVideos } from '../hooks/useFavoriteVideos';
import { getVideoProgressPercent } from '../lib/video-progress';
import { useStore } from '../store/useStore';

interface Props {
  video: YouTubeVideo;
  index: number;
  channelThumbnail?: string;
}

export const VideoCard = ({ video, channelThumbnail }: Props) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const navigate = useNavigate();
  const { isFavoriteVideo, toggleFavoriteVideo } = useFavoriteVideos();
  const { watchedVideos, markAsWatched, markAsUnwatched } = useStore();
  const isFavorite = isFavoriteVideo(video.id);
  const isWatched = watchedVideos.has(video.id);
  const progressPercent = getVideoProgressPercent(video.id);

  const openVideo = () => {
    navigate(`/video/${video.id}`);
  };

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    toggleFavoriteVideo(video);
  };

  const handleWatchedClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isWatched) {
      markAsUnwatched(video.id);
    } else {
      markAsWatched(video.id);
    }
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
    <div
      onClick={openVideo}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md transition-colors duration-200 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 sm:hover:shadow-xl"
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
          className={`w-full h-full object-cover transition-all duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
        />

        {/* Play overlay */}
        <div className="absolute inset-0 hidden items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40 sm:flex">
          <div className="opacity-0 transition-opacity group-hover:opacity-100">
            <div className="bg-red-600 rounded-full p-4">
              <Play className="w-8 h-8 text-white fill-white" />
            </div>
          </div>
        </div>

        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs text-white font-medium">
            {video.duration}
          </div>
        )}

      </div>

      {/* Info */}
      <div data-testid="video-card-info" className="flex h-28 flex-col p-3">
        <div className="mb-1 h-10">
          <h4 className="font-medium text-sm line-clamp-2 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
            {video.title}
          </h4>
        </div>

        <div className="mb-1 flex min-w-0 items-center gap-2">
          {channelThumbnail && (
            <img
              src={getDisplayThumbnail(channelThumbnail, video.channelTitle)}
              alt={`${video.channelTitle} icon`}
              className="h-5 w-5 flex-none rounded-full object-cover"
              loading="lazy"
            />
          )}
          <p className="truncate text-xs text-gray-600 dark:text-gray-400">
            {video.channelTitle}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2 pr-24 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>{formatDate(video.publishedAt)}</span>
          </div>
          <button
            type="button"
            onClick={handleWatchedClick}
            aria-label={isWatched ? 'Mark video as unwatched' : 'Mark video as watched'}
            className={`absolute bottom-3 right-14 flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors ${isWatched
              ? 'bg-emerald-600/10 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400'
              : 'text-gray-400 hover:bg-gray-100 hover:text-emerald-500 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-emerald-400'
              }`}
          >
            <CheckCircle2 className={`h-5 w-5 ${isWatched ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleFavoriteClick}
            aria-label={isFavorite ? 'Remove video from favorites' : 'Add video to favorites'}
            className={`absolute bottom-3 right-3 flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors ${isFavorite
              ? 'bg-red-600/10 text-red-500 dark:bg-red-500/15 dark:text-red-400'
              : 'text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-red-400'
              }`}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>
      {progressPercent > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-800">
          <div
            data-testid="video-progress-bar"
            className="h-full bg-red-600"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};
