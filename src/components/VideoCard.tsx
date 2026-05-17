import { Play, Clock, Heart, CheckCircle2, ListPlus } from 'lucide-react';
import type { YouTubeVideo } from '../types/youtube';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDisplayThumbnail } from '../lib/icon-loader';
import { getHighResolutionVideoThumbnail, getNextVideoThumbnailFallback, isLikelyLowResolutionYouTubePlaceholder } from '../lib/video-thumbnails';
import { useFavoriteVideos } from '../hooks/useFavoriteVideos';
import { useQueuedVideos } from '../hooks/useQueuedVideos';
import { clearVideoProgress, getVideoProgress, getVideoProgressPercent, saveVideoProgress } from '../lib/video-progress';
import { allowEnhancedMediaPlayback, loadYouTubeIframeApi, type YouTubePlayer } from '../lib/youtube-iframe-api';
import { useStore } from '../store/useStore';
import { isLiveVideo } from '../lib/video-live';
import { isShortVideo } from '../lib/video-feed-index';

interface Props {
  video: YouTubeVideo;
  index: number;
  channelThumbnail?: string;
  onUnavailable?: (videoId: string) => void;
}

const getDashboardScrollStorageKey = (search: string) => {
  const tab = new URLSearchParams(search).get('tab');

  if (tab === 'queue') return 'queued-videos-scroll';
  if (tab === 'favorites') return 'favorite-videos-scroll';
  return 'latest-videos-scroll';
};

const SWIPE_TO_WATCHED_THRESHOLD = 80;
const SWIPE_VERTICAL_CANCEL_THRESHOLD = 48;
const WATCHED_PERCENT_THRESHOLD = 0.5;
const WATCHED_SECONDS_THRESHOLD = 30;

export const VideoCard = ({ video, channelThumbnail, onUnavailable }: Props) => {
  const isLikelyShort = video.isShort === true || isShortVideo({ ...video, isShort: undefined });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [thumbnailUnavailable, setThumbnailUnavailable] = useState(false);
  const [thumbnailSrc, setThumbnailSrc] = useState(() => (
    getHighResolutionVideoThumbnail(video.thumbnail, { isShort: isLikelyShort })
  ));
  const [isPlayingInline, setIsPlayingInline] = useState(false);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const thumbnailFallbackCountRef = useRef(0);
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isFavoriteVideo, toggleFavoriteVideo } = useFavoriteVideos();
  const { isQueuedVideo, toggleQueuedVideo } = useQueuedVideos();
  const { watchedVideos, markAsWatched, markAsUnwatched } = useStore();
  const isFavorite = isFavoriteVideo(video.id);
  const isQueued = isQueuedVideo(video.id);
  const [isQueueButtonActive, setIsQueueButtonActive] = useState(isQueued);
  const [progressPercent, setProgressPercent] = useState(() => getVideoProgressPercent(video.id));
  const inlinePlayerContainerRef = useRef<HTMLDivElement | null>(null);
  const inlinePlayerRef = useRef<YouTubePlayer | null>(null);
  const inlineSaveIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const isWatched = watchedVideos.has(video.id);
  const isLive = isLiveVideo(video);

  useEffect(() => {
    setImageLoaded(false);
    setThumbnailUnavailable(false);
    setIsPlayingInline(false);
    setProgressPercent(getVideoProgressPercent(video.id));
    thumbnailFallbackCountRef.current = 0;
    setThumbnailSrc(getHighResolutionVideoThumbnail(video.thumbnail, { isShort: isLikelyShort }));
  }, [video.id, video.thumbnail, isLikelyShort]);

  useEffect(() => {
    const updateProgress = () => setProgressPercent(getVideoProgressPercent(video.id));

    window.addEventListener('video-progress-changed', updateProgress);
    return () => window.removeEventListener('video-progress-changed', updateProgress);
  }, [video.id]);

  useEffect(() => {
    if (!isPlayingInline) return;

    let isMounted = true;
    let hasReachedResumePoint = false;
    let resumeFromSeconds = 0;

    const persistCurrentProgress = () => {
      const player = inlinePlayerRef.current;
      if (!player) return;

      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();

      if (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0) {
        if (!hasReachedResumePoint) {
          if (currentTime < Math.max(1, resumeFromSeconds - 2)) return;
          hasReachedResumePoint = true;
        }

        saveVideoProgress(video.id, currentTime, duration);
        setProgressPercent(Math.min(100, Math.max(0, (currentTime / duration) * 100)));
        if (currentTime >= WATCHED_SECONDS_THRESHOLD || currentTime / duration >= WATCHED_PERCENT_THRESHOLD) {
          markAsWatched(video.id);
        }
      }
    };

    loadYouTubeIframeApi().then((youtubeApi) => {
      if (!isMounted || !inlinePlayerContainerRef.current) return;

      const savedProgress = getVideoProgress(video.id);
      resumeFromSeconds = savedProgress ? Math.floor(savedProgress.currentTime) : 0;
      hasReachedResumePoint = resumeFromSeconds <= 0;

      inlinePlayerRef.current = new youtubeApi.Player(inlinePlayerContainerRef.current, {
        videoId: video.id,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          start: resumeFromSeconds,
        },
        events: {
          onReady: (event) => {
            allowEnhancedMediaPlayback(event.target);
            if (resumeFromSeconds > 0) {
              event.target.seekTo(resumeFromSeconds, true);
            }
            event.target.playVideo();
            persistCurrentProgress();
          },
          onStateChange: (event) => {
            if (event.data === youtubeApi.PlayerState.ENDED) {
              clearVideoProgress(video.id);
              setProgressPercent(0);
            } else {
              persistCurrentProgress();
            }
          },
          onError: () => {},
        },
      });

      inlineSaveIntervalRef.current = window.setInterval(persistCurrentProgress, 2500);
    });

    return () => {
      isMounted = false;
      persistCurrentProgress();
      if (inlineSaveIntervalRef.current) window.clearInterval(inlineSaveIntervalRef.current);
      inlineSaveIntervalRef.current = null;
      inlinePlayerRef.current?.destroy();
      inlinePlayerRef.current = null;
    };
  }, [isPlayingInline, markAsWatched, video.id]);

  useEffect(() => {
    setIsQueueButtonActive(isQueued);
  }, [isQueued, video.id]);

  const openVideo = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    sessionStorage.setItem(getDashboardScrollStorageKey(location.search), String(Math.round(window.scrollY)));
    navigate(`/video/${video.id}`);
  };

  const playInline = () => {
    setIsPlayingInline(true);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;

    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointerStart = pointerStartRef.current;
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;

    if (Math.abs(deltaY) > SWIPE_VERTICAL_CANCEL_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
      pointerStartRef.current = null;
      setDragOffsetX(0);
      return;
    }

    if (Math.abs(deltaX) > 12) {
      setDragOffsetX(Math.max(-120, Math.min(120, deltaX)));
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const pointerStart = pointerStartRef.current;
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - pointerStart.x;
    const shouldMarkWatched = Math.abs(deltaX) >= SWIPE_TO_WATCHED_THRESHOLD;

    pointerStartRef.current = null;
    setDragOffsetX(0);

    if (shouldMarkWatched) {
      suppressNextClickRef.current = true;
      if (!isWatched) {
        markAsWatched(video.id);
      }
    }
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    setDragOffsetX(0);
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

  const handleQueueClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsQueueButtonActive((isActive) => !isActive);
    toggleQueuedVideo(video);
  };

  const useNextThumbnailFallback = () => {
    const fallback = getNextVideoThumbnailFallback(thumbnailSrc, { isShort: isLikelyShort });
    if (!fallback) {
      setImageLoaded(false);
      setThumbnailUnavailable(true);
      return false;
    }

    setImageLoaded(false);
    setThumbnailUnavailable(false);
    thumbnailFallbackCountRef.current += 1;
    setThumbnailSrc(fallback);
    return true;
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

  if (thumbnailUnavailable) {
    return null;
  }

  return (
    <div
      data-testid="video-card"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      style={{ transform: `translateX(${dragOffsetX}px)` }}
      className="group relative flex h-full touch-pan-y flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md transition-colors duration-200 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 sm:hover:shadow-xl"
    >
      {Math.abs(dragOffsetX) > 12 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-emerald-600/15 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
          <CheckCircle2 className="mr-2 h-5 w-5" />
          <span>{isWatched ? 'Watched' : 'Mark watched'}</span>
        </div>
      )}
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-black">
        {isPlayingInline ? (
          <div
            ref={inlinePlayerContainerRef}
            data-testid="inline-video-player"
            title={`${video.title} player`}
            className="h-full w-full"
          />
        ) : (
          <button
            type="button"
            aria-label={`Play ${video.title} inline`}
            onClick={playInline}
            className="relative h-full w-full cursor-pointer bg-black p-0 text-left"
          >
            {!imageLoaded && !thumbnailUnavailable && (
              <div
                data-testid="video-thumbnail-loading"
                className="absolute inset-0 animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800"
              />
            )}
            <img
              src={thumbnailSrc}
              alt={video.title}
              loading="lazy"
              onError={() => {
                useNextThumbnailFallback();
              }}
              onLoad={(event) => {
                if (isLikelyLowResolutionYouTubePlaceholder(thumbnailSrc, event.currentTarget)) {
                  useNextThumbnailFallback();
                  return;
                }
                if (
                  thumbnailFallbackCountRef.current > 0 &&
                  /\/default\.(?:jpg|webp)(?:\?|$)/i.test(thumbnailSrc) &&
                  event.currentTarget.naturalWidth <= 120 &&
                  event.currentTarget.naturalHeight <= 90
                ) {
                  setImageLoaded(false);
                  setThumbnailUnavailable(true);
                  onUnavailable?.(video.id);
                  return;
                }
                setThumbnailUnavailable(false);
                setImageLoaded(true);
              }}
              className={`h-full w-full ${isLikelyShort ? 'object-contain bg-black' : 'object-cover'} transition-all duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
            />

            <div className="absolute inset-0 hidden items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40 sm:flex">
              <div className="opacity-0 transition-opacity group-hover:opacity-100">
                <div className="rounded-full bg-red-600 p-4">
                  <Play className="h-8 w-8 fill-white text-white" />
                </div>
              </div>
            </div>
          </button>
        )}

        {!isPlayingInline && isLive && (
          <div className="absolute left-2 top-2 rounded bg-red-600 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
            LIVE
          </div>
        )}

        {!isPlayingInline && video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs text-white font-medium">
            {video.duration}
          </div>
        )}

      </div>

      {/* Info */}
      <div data-testid="video-card-info" className="flex h-28 flex-col p-3">
        <div className="mb-1 h-10">
          <h4 className="font-medium text-sm line-clamp-2 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
            <button
              type="button"
              onClick={openVideo}
              aria-label={`Open ${video.title}`}
              className="line-clamp-2 text-left transition-colors hover:text-red-600 dark:hover:text-red-400"
            >
              {video.title}
            </button>
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

        <div className="mt-auto flex items-center gap-2 pr-36 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            <span>{formatDate(video.publishedAt)}</span>
          </div>
          <button
            type="button"
            onClick={handleWatchedClick}
            aria-label={isWatched ? 'Mark video as unwatched' : 'Mark video as watched'}
            className={`absolute bottom-3 right-24 flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors ${isWatched
              ? 'bg-emerald-600/10 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-400'
              : 'text-gray-400 hover:bg-gray-100 hover:text-emerald-500 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-emerald-400'
              }`}
          >
            <CheckCircle2 className={`h-5 w-5 ${isWatched ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleQueueClick}
            aria-label={isQueueButtonActive ? 'Remove video from queue' : 'Add video to queue'}
            className={`absolute bottom-3 right-14 flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors ${isQueueButtonActive
              ? 'bg-blue-600/10 text-blue-500 dark:bg-blue-500/15 dark:text-blue-400'
              : 'text-gray-400 hover:bg-gray-100 hover:text-blue-500 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-blue-400'
              }`}
          >
            <ListPlus className={`h-5 w-5 ${isQueueButtonActive ? 'stroke-[2.5]' : ''}`} />
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
