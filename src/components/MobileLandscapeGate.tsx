import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCurrentViewportSize,
  INLINE_VIDEO_PLAYBACK_CHANGE_EVENT,
  type InlineVideoPlaybackChangeDetail,
  isCompactMobileViewport,
} from '../lib/mobile-viewport';

interface MobileLandscapeGateProps {
  children: ReactNode;
}

export const MobileLandscapeGate = ({ children }: MobileLandscapeGateProps) => {
  const location = useLocation();
  const [inlinePlayingVideoIds, setInlinePlayingVideoIds] = useState<Set<string>>(() => new Set());
  const [viewportSize, setViewportSize] = useState(() => getCurrentViewportSize());
  const allowsLandscape = location.pathname.startsWith('/video/') || inlinePlayingVideoIds.size > 0;
  const isCompactLandscape = !allowsLandscape && isCompactMobileViewport(viewportSize) && viewportSize.width > viewportSize.height;

  useEffect(() => {
    const updateInlinePlayback = (event: Event) => {
      const { videoId, isPlaying } = (event as CustomEvent<InlineVideoPlaybackChangeDetail>).detail;

      setInlinePlayingVideoIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (isPlaying) {
          nextIds.add(videoId);
        } else {
          nextIds.delete(videoId);
        }
        return nextIds;
      });
    };

    window.addEventListener(INLINE_VIDEO_PLAYBACK_CHANGE_EVENT, updateInlinePlayback);
    return () => window.removeEventListener(INLINE_VIDEO_PLAYBACK_CHANGE_EVENT, updateInlinePlayback);
  }, []);

  useEffect(() => {
    const orientation = window.screen?.orientation as (ScreenOrientation & {
      lock?: (orientation: 'portrait') => Promise<void>;
      unlock?: () => void;
    }) | undefined;

    if (allowsLandscape) {
      orientation?.unlock?.();
    } else if (isCompactMobileViewport(getCurrentViewportSize())) {
      orientation?.lock?.('portrait').catch(() => {
        // Some mobile browsers only allow orientation locks after install/fullscreen.
      });
    }
  }, [allowsLandscape]);

  useEffect(() => {
    const updateViewportSize = () => setViewportSize(getCurrentViewportSize());
    window.addEventListener('resize', updateViewportSize, { passive: true });
    window.addEventListener('orientationchange', updateViewportSize);
    return () => {
      window.removeEventListener('resize', updateViewportSize);
      window.removeEventListener('orientationchange', updateViewportSize);
    };
  }, []);

  if (isCompactLandscape) {
    return (
      <div className="mobile-landscape-lock fixed inset-0 z-[200] flex items-center justify-center bg-gray-950 px-6 text-center text-gray-100">
        <div className="mobile-landscape-lock-content max-w-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <div className="h-8 w-5 rounded-sm border-2 border-current" />
          </div>
          <h1 className="text-2xl font-semibold">
            Rotate back to portrait
          </h1>
          <p className="mt-3 text-sm text-gray-400">
            The app is locked to portrait on tabs. Open a video to use landscape playback.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
