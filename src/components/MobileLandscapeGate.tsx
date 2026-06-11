import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getCurrentViewportSize,
  isCompactMobileViewport,
} from '../lib/mobile-viewport';

interface MobileLandscapeGateProps {
  children: ReactNode;
}

export const MobileLandscapeGate = ({ children }: MobileLandscapeGateProps) => {
  const location = useLocation();
  const allowsLandscape = location.pathname.startsWith('/video/');

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

  return <>{children}</>;
};
