import { useState } from 'react';
import { motion } from 'framer-motion';
import { Image, Inbox, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SubscriptionCard } from './SubscriptionCard';
import { SkeletonCard } from './SkeletonCard';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { useStore } from '../store/useStore';

export const SubscriptionsList = () => {
  const { subscriptions, rawSubscriptions, isLoading, removeSubscription, addSubscriptions, toggleFavorite, toggleMute, repairChannelIcons } = useSubscriptionStorage();
  const { viewMode } = useStore();
  const [isRepairingIcons, setIsRepairingIcons] = useState(false);

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

  return (
    <div data-testid="subscriptions-list" className="px-4 bg-gray-50 dark:bg-gray-950">
      <div data-testid="repair-icons-toolbar" className="sticky top-[calc(env(safe-area-inset-top)+8.5rem)] z-20 mb-4 flex justify-end bg-gray-50 py-2 dark:bg-gray-950 sm:top-[9rem]">
        <button
          disabled={isRepairingIcons}
          onClick={async () => {
            setIsRepairingIcons(true);
            try {
              const repairedCount = await repairChannelIcons({ useApi: true });
              toast.success(
                repairedCount > 0
                  ? `Updated ${repairedCount} channel icon${repairedCount === 1 ? '' : 's'}`
                  : 'Channel icons are already up to date'
              );
            } catch (error) {
              toast.error('Could not repair channel icons', {
                description: error instanceof Error ? error.message : 'Unknown error',
              });
            } finally {
              setIsRepairingIcons(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          {isRepairingIcons ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
          {isRepairingIcons ? 'Repairing...' : 'Repair icons'}
        </button>
      </div>
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-2 gap-3 pb-8 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5'
            : 'flex flex-col gap-4 pb-8'
        }
      >
        {subscriptions.map((channel, index) => (
          <SubscriptionCard
            key={channel.id}
            channel={channel}
            index={index}
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
                    onToggleMute={async (channelId) => {
                      const channel = subscriptions.find(s => s.id === channelId);
                      const wasMuted = channel?.isMuted;

                      console.log('🔇 Toggling mute for:', channel?.title, 'Current state:', wasMuted);

                      await toggleMute(channelId);

                      console.log('✅ Mute toggled successfully');

                      if (channel) {
                        toast.success(
                          wasMuted ? `Unmuted ${channel.title}` : `Muted ${channel.title}`
                        );
                      }
                    }}
          />
        ))}
      </div>
    </div>
  );
};
