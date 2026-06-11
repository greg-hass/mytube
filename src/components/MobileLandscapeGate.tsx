import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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

    const lockPortrait = () => {
      orientation?.lock?.('portrait').catch(() => {
        // Some mobile browsers only allow orientation locks after install/fullscreen.
      });
    };

    if (allowsLandscape) {
      orientation?.unlock?.();
      return;
    }

    lockPortrait();

    const lockOnVisible = () => {
      if (document.visibilityState === 'visible') lockPortrait();
    };

    window.addEventListener('orientationchange', lockPortrait);
    window.addEventListener('resize', lockPortrait, { passive: true });
    document.addEventListener('visibilitychange', lockOnVisible);

    return () => {
      window.removeEventListener('orientationchange', lockPortrait);
      window.removeEventListener('resize', lockPortrait);
      document.removeEventListener('visibilitychange', lockOnVisible);
    };
  }, [allowsLandscape]);

  return <>{children}</>;
};
