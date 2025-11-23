import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { SubscriptionCard } from './SubscriptionCard';
import { SkeletonCard } from './SkeletonCard';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { useStore } from '../store/useStore';

export const SubscriptionsList = () => {
  const { subscriptions, rawSubscriptions, isLoading, removeSubscription, addSubscriptions, toggleFavorite } = useSubscriptionStorage();
  const { viewMode } = useStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const SCROLL_STORAGE_KEY = 'subscriptions-scroll-top';
  const [itemsPerRow, setItemsPerRow] = useState(viewMode === 'grid' ? 5 : 1);

  // Update items per row based on container width
  useEffect(() => {
    if (viewMode === 'list') {
      setItemsPerRow(1);
      return;
    }

    const updateItemsPerRow = () => {
      if (!parentRef.current) return;
      const width = parentRef.current.offsetWidth;
      // Matches Tailwind breakpoints: sm: 640px, lg: 1024px, xl: 1280px
      // We subtract some padding/gap to be safe
      if (width >= 1280) setItemsPerRow(5);
      else if (width >= 1024) setItemsPerRow(4);
      else if (width >= 640) setItemsPerRow(3);
      else setItemsPerRow(2);
    };

    // Initial check
    updateItemsPerRow();

    const observer = new ResizeObserver(updateItemsPerRow);
    if (parentRef.current) {
      observer.observe(parentRef.current);
    }

    return () => observer.disconnect();
  }, [viewMode]);

  // Virtual scrolling for performance with large lists
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(subscriptions.length / itemsPerRow),
    getScrollElement: () => parentRef.current,
    estimateSize: () => (viewMode === 'grid' ? 320 : 200),
    overscan: 10, // Increased for smoother scrolling
  });

  if (isLoading) {
    return (
      <div className="px-4">
        <div className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
            : 'flex flex-col gap-4'
        }>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </div>
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

  // Restore and persist scroll position
  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;

    // Restore on mount
    const saved = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (saved) {
      const value = Number(saved);
      if (!Number.isNaN(value)) {
        container.scrollTop = value;
      }
    }

    // Persist on scroll
    const handleScroll = () => {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, String(container.scrollTop));
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [SCROLL_STORAGE_KEY, subscriptions.length]);

  return (
    <div ref={parentRef} className="h-[calc(100vh-180px)] overflow-auto px-4">
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
                    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6 mb-6'
                    : 'flex flex-col gap-4 mb-4'
                }
              >
                {rowItems.map((channel, idx) => (
                  <SubscriptionCard
                    key={channel.id}
                    channel={channel}
                    index={startIndex + idx}
                    onRemove={async (channelId) => {
                      const removedChannel = rawSubscriptions.find(s => s.id === channelId);
                      await removeSubscription(channelId);

                      if (removedChannel) {
                        toast.success(`Removed ${removedChannel.title}`, {
                          description: 'Channel removed from subscriptions',
                          action: {
                            label: 'Undo',
                            onClick: async () => {
                              await addSubscriptions([removedChannel]);
                              toast.success('Channel restored');
                            },
                          },
                        });
                      }
                    }}
                    onToggleFavorite={async (channelId) => {
                      const channel = subscriptions.find(s => s.id === channelId);
                      const wasFavorite = channel?.isFavorite;

                      await toggleFavorite(channelId);

                      if (channel) {
                        toast.success(
                          wasFavorite ? `Removed ${channel.title} from favorites` : `Added ${channel.title} to favorites`
                        );
                      }
                    }}
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
