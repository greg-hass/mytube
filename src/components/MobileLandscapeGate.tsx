import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

interface MobileLandscapeGateProps {
  children: ReactNode;
}

function getViewportLockState() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  return {
    height,
    isLandscape: width > height,
    width,
  };
}

export const MobileLandscapeGate = ({ children }: MobileLandscapeGateProps) => {
  const [viewportLockState, setViewportLockState] = useState(() => getViewportLockState());

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

    const updateViewportLockState = () => {
      setViewportLockState(getViewportLockState());
    };

    const lockOnVisible = () => {
      if (document.visibilityState === 'visible') {
        lockPortrait();
        updateViewportLockState();
      }
    };

    window.addEventListener('orientationchange', updateViewportLockState);
    window.addEventListener('orientationchange', lockPortrait);
    window.addEventListener('resize', updateViewportLockState, { passive: true });
    window.addEventListener('resize', lockPortrait, { passive: true });
    document.addEventListener('visibilitychange', lockOnVisible);

    return () => {
      window.removeEventListener('orientationchange', updateViewportLockState);
      window.removeEventListener('orientationchange', lockPortrait);
      window.removeEventListener('resize', updateViewportLockState);
      window.removeEventListener('resize', lockPortrait);
      document.removeEventListener('visibilitychange', lockOnVisible);
    };
  }, []);

  return (
    <div className={viewportLockState.isLandscape ? 'orientation-locked-viewport' : 'orientation-unlocked-viewport'}>
      <div
        className={viewportLockState.isLandscape ? 'orientation-locked-shell' : 'orientation-unlocked-shell'}
        style={viewportLockState.isLandscape ? {
          height: `${viewportLockState.width}px`,
          transform: 'translate(-50%, -50%) rotate(-90deg)',
          width: `${viewportLockState.height}px`,
        } : undefined}
      >
        {children}
      </div>
    </div>
  );
};
