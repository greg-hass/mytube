import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { SubscriptionCard } from './SubscriptionCard';
import { SkeletonCard } from './SkeletonCard';
import { useSubscriptionStorage } from '../hooks/useSubscriptionStorage';
import { useStore } from '../store/useStore';

interface SubscriptionsListProps {
  selectedGroup?: string;
  groups?: string[];
}

export const SubscriptionsList = ({
  selectedGroup = 'all',
  groups,
}: SubscriptionsListProps) => {
  const { subscriptions, rawSubscriptions, isLoading, removeSubscription, addSubscriptions, toggleFavorite, toggleMute, setSubscriptionGroup } = useSubscriptionStorage();
  const { viewMode } = useStore();

  const subscriptionGroups = groups ?? Array.from(new Set([
    ...subscriptions
      .map((channel) => channel.group?.trim())
      .filter((group): group is string => Boolean(group)),
  ])).sort((a, b) => a.localeCompare(b));

  const visibleSubscriptions = selectedGroup === 'all'
    ? subscriptions
    : subscriptions.filter((channel) => (channel.group || '') === selectedGroup);

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

  if (visibleSubscriptions.length === 0 && selectedGroup === 'all') {
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
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-2 gap-3 pb-8 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5'
            : 'flex flex-col gap-4 pb-8'
        }
      >
        {visibleSubscriptions.map((channel, index) => (
          <SubscriptionCard
            key={channel.id}
            channel={channel}
            index={index}
            groups={subscriptionGroups}
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
            onSetGroup={async (channelId, group) => {
              await setSubscriptionGroup(channelId, group);
              const channel = subscriptions.find(s => s.id === channelId);
              if (channel) {
                toast.success(
                  group ? `Moved ${channel.title} to ${group}` : `Removed ${channel.title} from groups`
                );
              }
            }}
          />
        ))}
      </div>
    </div>
  );
};
