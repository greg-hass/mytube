import { useState, useRef, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  children: ReactNode;
  enabled?: boolean;
}

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;

export const PullToRefresh = ({
  onRefresh,
  isRefreshing,
  children,
  enabled = true,
}: PullToRefreshProps) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || isRefreshing) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop > 1) return;

      startYRef.current = e.touches[0].clientY;
      setIsPulling(true);
    },
    [enabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || startYRef.current === null || isRefreshing) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      if (scrollTop > 1) {
        startYRef.current = null;
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;

      if (diff > 0) {
        const resistance = 0.5;
        const distance = Math.min(diff * resistance, MAX_PULL);
        setPullDistance(distance);

        if (containerRef.current) {
          containerRef.current.style.transform = `translateY(${distance}px)`;
          containerRef.current.style.transition = 'none';
        }
      }
    },
    [enabled, isRefreshing]
  );

  const handleTouchEnd = useCallback(() => {
    if (startYRef.current === null) return;

    startYRef.current = null;
    setIsPulling(false);

    if (containerRef.current) {
      containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      containerRef.current.style.transform = 'translateY(0)';
    }

    if (pullDistance >= PULL_THRESHOLD) {
      onRefresh();
    }

    setPullDistance(0);
  }, [pullDistance, onRefresh]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const shouldTrigger = pullDistance >= PULL_THRESHOLD;

  return (
    <div className="relative">
      <AnimatePresence>
        {(isPulling || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-0 left-0 right-0 z-40 flex items-center justify-center pointer-events-none"
            style={{
              height: `${Math.max(pullDistance, isRefreshing ? PULL_THRESHOLD : 0)}px`,
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <motion.div
                animate={{
                  rotate: isRefreshing ? 360 : shouldTrigger ? 180 : progress * 360,
                  scale: shouldTrigger && !isRefreshing ? 1.1 : 1,
                }}
                transition={{
                  rotate: isRefreshing
                    ? { repeat: Infinity, duration: 1, ease: 'linear' }
                    : { type: 'spring', stiffness: 300, damping: 20 },
                  scale: { type: 'spring', stiffness: 400, damping: 15 },
                }}
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  shouldTrigger || isRefreshing
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 dark:bg-ios-800 text-gray-500 dark:text-ios-400'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
              </motion.div>
              {shouldTrigger && !isRefreshing && (
                <motion.span
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[10px] font-semibold text-red-500"
                >
                  Release to refresh
                </motion.span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="touch-pan-y"
      >
        {children}
      </div>
    </div>
  );
};
