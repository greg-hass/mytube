import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { getCurrentViewportSize, isCompactMobileViewport } from '../lib/mobile-viewport';

interface MobileLandscapeGateProps {
  children: ReactNode;
}

export const MobileLandscapeGate = ({ children }: MobileLandscapeGateProps) => {
  const location = useLocation();
  const allowsLandscape = location.pathname.startsWith('/video/');
  const [isLockedLandscape, setIsLockedLandscape] = useState(() => {
    const viewport = getCurrentViewportSize();
    return viewport.width > viewport.height && isCompactMobileViewport(viewport);
  });

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

    const updateLock = () => {
      const viewport = getCurrentViewportSize();
      setIsLockedLandscape(viewport.width > viewport.height && isCompactMobileViewport(viewport));
    };

    updateLock();
    window.addEventListener('resize', updateLock, { passive: true });
    window.addEventListener('orientationchange', updateLock, { passive: true });
    return () => {
      window.removeEventListener('resize', updateLock);
      window.removeEventListener('orientationchange', updateLock);
    };
  }, [allowsLandscape]);

  if (allowsLandscape) {
    return <>{children}</>;
  }

  if (!isLockedLandscape) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell fixed inset-0 z-[200] flex items-center justify-center p-6 text-center">
      <div className="max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <RotateCcw className="mx-auto mb-4 h-10 w-10 text-red-400" />
        <p className="text-xl font-semibold text-gray-100">Rotate back to portrait</p>
        <p className="mt-3 text-sm leading-6 text-gray-400">
          The browsing UI is portrait-only on phones. Landscape is kept for now playing videos.
        </p>
      </div>
    </div>
  );
};
