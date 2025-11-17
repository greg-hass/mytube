import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Inbox } from 'lucide-react';
import { SubscriptionCard } from './SubscriptionCard';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { useStore } from '../store/useStore';

export const SubscriptionsList = () => {
  const { subscriptions, isLoading } = useSubscriptionStorage();
  const { viewMode } = useStore();
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtual scrolling for performance with large lists
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(subscriptions.length / (viewMode === 'grid' ? 4 : 1)),
    getScrollElement: () => parentRef.current,
    estimateSize: () => (viewMode === 'grid' ? 320 : 200),
    overscan: 5,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 text-red-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Loading your subscriptions...
          </p>
        </motion.div>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[400px] text-center"
      >
        <Inbox className="w-20 h-20 text-gray-300 dark:text-gray-700 mb-4" />
        <h3 className="text-2xl font-semibold mb-2">No subscriptions found</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Try adjusting your search or subscribe to some channels on YouTube!
        </p>
      </motion.div>
    );
  }

  const itemsPerRow = viewMode === 'grid' ? 4 : 1;

  return (
    <div ref={parentRef} className="h-[calc(100vh-170px)] overflow-auto px-4">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * itemsPerRow;
          const rowItems = subscriptions.slice(
            startIndex,
            startIndex + itemsPerRow
          );

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-6'
                    : 'flex flex-col gap-4 mb-4'
                }
              >
                {rowItems.map((channel, idx) => (
                  <SubscriptionCard
                    key={channel.id}
                    channel={channel}
                    index={startIndex + idx}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
