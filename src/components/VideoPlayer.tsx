import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Header } from './Header';
import { clearVideoProgress, getVideoProgress, saveVideoProgress } from '../lib/video-progress';
import { useStore } from '../store/useStore';

interface YouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  getIframe?: () => HTMLIFrameElement;
  setPlaybackQuality?: (suggestedQuality: string) => void;
}

interface YouTubePlayerEvent {
  target: YouTubePlayer;
  data?: number;
}

interface YouTubePlayerOptions {
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: (event: YouTubePlayerEvent) => void;
    onStateChange: (event: YouTubePlayerEvent) => void;
    onError: (event: YouTubePlayerEvent) => void;
  };
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
  };
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;
const WATCHED_PERCENT_THRESHOLD = 0.5;
const WATCHED_SECONDS_THRESHOLD = 30;

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  youtubeApiPromise ??= new Promise<YouTubeApi>((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT?.Player) resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

function formatResumeTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function allowEnhancedMediaPlayback(player: YouTubePlayer) {
  const iframe = player.getIframe?.();
  if (!iframe) return;

  iframe.setAttribute(
    'allow',
    [
      'accelerometer',
      'autoplay',
      'clipboard-write',
      'encrypted-media',
      'gyroscope',
      'picture-in-picture',
      'web-share',
    ].join('; ')
  );
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('webkitallowfullscreen', '');
}

export const VideoPlayer = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const resumeInfoRef = useRef<{ videoId: string; seconds: number } | null>(null);
  const [playerProgressPercent, setPlayerProgressPercent] = useState(0);
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const markAsWatched = useStore((state) => state.markAsWatched);

  if (!videoId) {
    navigate('/');
    return null;
  }

  if (!resumeInfoRef.current || resumeInfoRef.current.videoId !== videoId) {
    const savedProgress = getVideoProgress(videoId);
    resumeInfoRef.current = {
      videoId,
      seconds: savedProgress ? Math.floor(savedProgress.currentTime) : 0,
    };
  }

  const resumeFromSeconds = resumeInfoRef.current.seconds;
  const youtubeWatchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setPlayerErrorCode(null);
  }, [videoId, markAsWatched]);

  useEffect(() => {
    let isMounted = true;

    const persistCurrentProgress = () => {
      const player = playerRef.current;
      if (!player || !videoId) return;

      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();

      if (Number.isFinite(currentTime) && Number.isFinite(duration) && duration > 0) {
        saveVideoProgress(videoId, currentTime, duration);
        setPlayerProgressPercent(Math.min(100, Math.max(0, (currentTime / duration) * 100)));
        if (currentTime >= WATCHED_SECONDS_THRESHOLD || currentTime / duration >= WATCHED_PERCENT_THRESHOLD) {
          markAsWatched(videoId);
        }
      }
    };

    loadYouTubeIframeApi().then((youtubeApi) => {
      if (!isMounted || !playerContainerRef.current) return;

      playerRef.current = new youtubeApi.Player(playerContainerRef.current, {
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
            setPlayerErrorCode(event.data ?? -1);
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
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

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

        {/* Video Player */}
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

        {/* Info Box */}
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
