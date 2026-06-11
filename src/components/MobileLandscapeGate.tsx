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
  const allowsLandscape = location.pathname.startsWith('/video/') || inlinePlayingVideoIds.size > 0;

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

  return <div className={allowsLandscape ? undefined : 'portrait-shell'}>{children}</div>;
};
