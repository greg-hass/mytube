import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Heart,
  ListPlus,
  SkipBack,
  SkipForward,
  UserCircle2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from './Header';
import { useFavoriteVideos } from '../hooks/useFavoriteVideos';
import { useQueuedVideos } from '../hooks/useQueuedVideos';
import { useRSSVideos } from '../hooks/useRSSVideos';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { getDisplayThumbnail } from '../lib/icon-loader';
import { getHighResolutionVideoThumbnail } from '../lib/video-thumbnails';
import { clearVideoProgress, getVideoProgress, saveVideoProgress } from '../lib/video-progress';
import { allowEnhancedMediaPlayback, loadYouTubeIframeApi, type YouTubePlayer } from '../lib/youtube-iframe-api';
import { useStore } from '../store/useStore';
import type { YouTubeVideo } from '../types/youtube';

const WATCHED_PERCENT_THRESHOLD = 0.5;
const WATCHED_SECONDS_THRESHOLD = 30;

function formatResumeTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function formatPublishedAt(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getVideoDurationLabel(duration: YouTubeVideo['duration']) {
  if (!duration) return '';

  if (typeof duration === 'string') {
    return duration;
  }

  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export const VideoPlayer = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const [playerProgressPercent, setPlayerProgressPercent] = useState(0);
  const [playerError, setPlayerError] = useState<{ videoId: string; code: number } | null>(null);
  const watchedVideos = useStore((state) => state.watchedVideos);
  const markAsWatched = useStore((state) => state.markAsWatched);
  const markAsUnwatched = useStore((state) => state.markAsUnwatched);
  const markAsWatchedRef = useRef(markAsWatched);
  markAsWatchedRef.current = markAsWatched;
  const { videos } = useRSSVideos();
  const { allSubscriptions } = useSubscriptionStorage();
  const { favoriteVideos, isFavoriteVideo, toggleFavoriteVideo } = useFavoriteVideos();
  const { queuedVideos, isQueuedVideo, toggleQueuedVideo } = useQueuedVideos();

  const resumeFromSeconds = useMemo(() => {
    const savedProgress = videoId ? getVideoProgress(videoId) : null;
    return savedProgress ? Math.floor(savedProgress.currentTime) : 0;
  }, [videoId]);

  const activeVideoId = videoId || '';
  const playerErrorCode = playerError?.videoId === activeVideoId ? playerError.code : null;
  const youtubeWatchUrl = `https://www.youtube.com/watch?v=${activeVideoId}`;
  const savedVideosById = new Map([
    ...favoriteVideos.map((video) => [video.id, video] as const),
    ...queuedVideos.map((video) => [video.id, video] as const),
  ]);
  const currentVideo = videos.find((video) => video.id === activeVideoId) ?? savedVideosById.get(activeVideoId);
  const currentVideoIndex = videos.findIndex((video) => video.id === activeVideoId);
  const previousVideo = currentVideoIndex > 0 ? videos[currentVideoIndex - 1] : null;
  const nextVideo = currentVideoIndex >= 0 && currentVideoIndex < videos.length - 1 ? videos[currentVideoIndex + 1] : null;
  const currentChannel = currentVideo
    ? allSubscriptions.find((channel) => channel.id === currentVideo.channelId)
    : null;
  const channelThumbnail = currentChannel?.thumbnail;
  const isWatched = watchedVideos.has(activeVideoId);
  const isFavorite = isFavoriteVideo(activeVideoId);
  const isQueued = isQueuedVideo(activeVideoId);
  const relatedVideos = currentVideo
    ? videos
      .filter((video) => video.channelId === currentVideo.channelId && video.id !== currentVideo.id)
      .slice(0, 4)
    : [];

  const navigateToVideo = (targetVideoId: string) => {
    navigate(`/video/${targetVideoId}`);
  };

  const handleWatchedClick = () => {
    if (!videoId) return;

    if (isWatched) {
      markAsUnwatched(videoId);
    } else {
      markAsWatched(videoId);
    }
  };

  useEffect(() => {
    if (!videoId) {
      navigate('/', { replace: true });
    }
  }, [navigate, videoId]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;
    let hasReachedResumePoint = resumeFromSeconds <= 0;

    const persistCurrentProgress = () => {
      const player = playerRef.current;
      if (
        !player ||
        !videoId ||
        typeof player.getCurrentTime !== 'function' ||
        typeof player.getDuration !== 'function'
      ) return;

      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();

      if (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0) {
        if (!hasReachedResumePoint) {
          if (currentTime < Math.max(1, resumeFromSeconds - 2)) return;
          hasReachedResumePoint = true;
        }

        saveVideoProgress(videoId, currentTime, duration);
        setPlayerProgressPercent(Math.min(100, Math.max(0, (currentTime / duration) * 100)));
        if (currentTime >= WATCHED_SECONDS_THRESHOLD || currentTime / duration >= WATCHED_PERCENT_THRESHOLD) {
          markAsWatchedRef.current(videoId);
        }
      }
    };

    loadYouTubeIframeApi().then((youtubeApi) => {
      if (!isMounted || !playerContainerRef.current) return;

      // Clear any leftover iframe from a previous player instance
      const container = playerContainerRef.current;
      container.innerHTML = '';

      playerRef.current = new youtubeApi.Player(container, {
        videoId,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          start: resumeFromSeconds,
          vq: 'hd1080',
        },
        events: {
          onReady: (event) => {
            allowEnhancedMediaPlayback(event.target);
            event.target.setPlaybackQuality?.('hd1080');
            if (resumeFromSeconds > 0) {
              event.target.seekTo(resumeFromSeconds, true);
            }
            event.target.playVideo();
            persistCurrentProgress();
          },
          onStateChange: (event) => {
            if (event.data === youtubeApi.PlayerState.ENDED) {
              clearVideoProgress(videoId);
              setPlayerProgressPercent(0);
            } else {
              persistCurrentProgress();
            }
          },
          onError: (event) => {
            setPlayerError({ videoId, code: event.data ?? -1 });
          },
        },
      });

      saveIntervalRef.current = window.setInterval(persistCurrentProgress, 2500);
    });

    const saveOnPageExit = () => persistCurrentProgress();
    const saveOnVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistCurrentProgress();
    };

    window.addEventListener('pagehide', saveOnPageExit);
    document.addEventListener('visibilitychange', saveOnVisibilityChange);

    return () => {
      isMounted = false;
      persistCurrentProgress();
      window.removeEventListener('pagehide', saveOnPageExit);
      document.removeEventListener('visibilitychange', saveOnVisibilityChange);
      if (saveIntervalRef.current) window.clearInterval(saveIntervalRef.current);
      try {
        playerRef.current?.destroy();
      } catch {
        // destroy can throw if the iframe is already gone
      }
      playerRef.current = null;
    };
  }, [resumeFromSeconds, videoId]);

  if (!videoId) {
    return null;
  }

  return (
    <div className="app-shell min-h-screen">
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <div
              ref={playerContainerRef}
              title="YouTube video player"
              className="absolute top-0 left-0 w-full h-full"
            />
            {playerProgressPercent > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                <div
                  className="h-full bg-red-600"
                  style={{ width: `${playerProgressPercent}%` }}
                />
              </div>
            )}
            {playerErrorCode !== null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-950/90 p-6 text-center">
                <div>
                  <p className="text-lg font-semibold text-white">This video needs YouTube</p>
                  <p className="mt-2 text-sm text-gray-300">
                    The embedded mobile player was blocked for this video.
                  </p>
                </div>
                <a
                  href={youtubeWatchUrl}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open in YouTube</span>
                </a>
              </div>
            )}
          </div>

          {/* Open in YouTube Button */}
          <div className="flex flex-col gap-3 p-4 border-t border-gray-200 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
            {resumeFromSeconds > 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Resuming from {formatResumeTime(resumeFromSeconds)}
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Progress is saved automatically while you watch
              </p>
            )}
            <a
              href={youtubeWatchUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in YouTube</span>
            </a>
          </div>
        </motion.div>

        {currentVideo && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6 space-y-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight text-gray-950 dark:text-gray-50 sm:text-3xl">
                  {currentVideo.title}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex min-w-0 items-center gap-2">
                    {channelThumbnail ? (
                      <img
                        src={getDisplayThumbnail(channelThumbnail, currentVideo.channelTitle)}
                        alt={`${currentVideo.channelTitle} icon`}
                        className="h-7 w-7 flex-none rounded-full object-cover"
                      />
                    ) : (
                      <UserCircle2 className="h-7 w-7 flex-none text-gray-400" />
                    )}
                    <span className="truncate font-medium text-gray-800 dark:text-gray-200">
                      {currentVideo.channelTitle}
                    </span>
                  </div>
                  {formatPublishedAt(currentVideo.publishedAt) && (
                    <span>{formatPublishedAt(currentVideo.publishedAt)}</span>
                  )}
                  {getVideoDurationLabel(currentVideo.duration) && (
                    <span>{getVideoDurationLabel(currentVideo.duration)}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={handleWatchedClick}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isWatched
                    ? 'bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  <CheckCircle2 className={`h-4 w-4 ${isWatched ? 'fill-current' : ''}`} />
                  <span>{isWatched ? 'Watched' : 'Watch'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleQueuedVideo(currentVideo)}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isQueued
                    ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  <ListPlus className="h-4 w-4" />
                  <span>{isQueued ? 'Queued' : 'Queue'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavoriteVideo(currentVideo)}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isFavorite
                    ? 'bg-red-600/10 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
                  <span>{isFavorite ? 'Saved' : 'Save'}</span>
                </button>
              </div>
            </div>

            {(previousVideo || nextVideo) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!previousVideo}
                  onClick={() => previousVideo && navigateToVideo(previousVideo.id)}
                  className="flex min-h-16 items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:enabled:hover:bg-gray-800"
                >
                  <SkipBack className="h-5 w-5 flex-none text-gray-500" />
                  <span className="min-w-0">
                    <span className="block text-xs uppercase text-gray-500">Previous</span>
                    <span className="line-clamp-1 text-sm font-medium">{previousVideo?.title || 'No previous video'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!nextVideo}
                  onClick={() => nextVideo && navigateToVideo(nextVideo.id)}
                  className="flex min-h-16 items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:enabled:hover:bg-gray-800"
                >
                  <SkipForward className="h-5 w-5 flex-none text-gray-500" />
                  <span className="min-w-0">
                    <span className="block text-xs uppercase text-gray-500">Next</span>
                    <span className="line-clamp-1 text-sm font-medium">{nextVideo?.title || 'No next video'}</span>
                  </span>
                </button>
              </div>
            )}

            {relatedVideos.length > 0 && (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-gray-950 dark:text-gray-50">
                  More from {currentVideo.channelTitle}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {relatedVideos.map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => navigateToVideo(video.id)}
                      className="overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
                    >
                      <div className="aspect-video bg-gray-200 dark:bg-gray-800">
                        <img
                          src={getHighResolutionVideoThumbnail(video.thumbnail)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-2 p-3">
                        <p className="line-clamp-2 text-sm font-medium text-gray-950 dark:text-gray-50">
                          {video.title}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          <span>{formatPublishedAt(video.publishedAt)}</span>
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
        >
          <p className="text-sm text-blue-800 dark:text-blue-200">
            You are watching this video in-app. Use the button above to open it in YouTube for comments and descriptions.
          </p>
        </motion.div>
      </div>
    </div>
  );
};
