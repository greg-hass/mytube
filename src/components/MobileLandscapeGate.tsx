import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface MobileLandscapeGateProps {
  children: ReactNode;
}

export const MobileLandscapeGate = ({ children }: MobileLandscapeGateProps) => {
  useEffect(() => {
    const orientation = window.screen?.orientation as (ScreenOrientation & {
      lock?: (orientation: 'portrait') => Promise<void>;
    }) | undefined;

    const lockPortrait = () => {
      orientation?.lock?.('portrait').catch(() => {
        // Some mobile browsers only allow orientation locks after install/fullscreen.
      });
    };

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
  }, []);

  return <>{children}</>;
};
