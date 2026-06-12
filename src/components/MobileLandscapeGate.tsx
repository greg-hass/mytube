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
      if (document.visibilityState === 'visible') {
        lockPortrait();
      }
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

  return (
    <>
      {children}
      <div
        aria-live="polite"
        className="mobile-landscape-message"
        role="status"
      >
        <div className="rounded-2xl border border-gray-800 bg-gray-950/95 px-6 py-5 text-center shadow-2xl">
          <p className="text-lg font-semibold text-gray-100">
            UI can only be viewed in portrait mode
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Rotate your phone back to portrait to continue.
          </p>
        </div>
      </div>
    </>
  );
};
