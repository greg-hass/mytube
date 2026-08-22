import { Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, EmptyStateAction } from "./EmptyState";
import { SubscriptionCard } from "./SubscriptionCard";
import { CompactSubscriptionsList } from "./CompactSubscriptionsList";
import { SkeletonCard } from "./SkeletonCard";
import { useSubscriptionStorage } from "../hooks/useSubscriptionStorage";
import { useStore } from "../store/useStore";
import {
  countChannelsWithoutUploadData,
  filterStaleChannels,
  type LastUploadByChannel,
} from "../lib/stale-channels";

interface SubscriptionsListProps {
  selectedGroup?: string;
  groups?: string[];
  onClearGroup?: () => void;
  selectable?: boolean;
  selectedChannelIds?: ReadonlySet<string>;
  onToggleSelect?: (channelId: string) => void;
  staleOnly?: boolean;
  lastUploadByChannel?: LastUploadByChannel;
}

export const SubscriptionsList = ({
  selectedGroup = "all",
  groups,
  onClearGroup,
  selectable = false,
  selectedChannelIds,
  onToggleSelect,
  staleOnly = false,
  lastUploadByChannel,
}: SubscriptionsListProps) => {
  const {
    subscriptions,
    rawSubscriptions,
    isLoading,
    removeSubscription,
    addSubscriptions,
    toggleFavorite,
    toggleMute,
    setSubscriptionGroup,
  } = useSubscriptionStorage();
  const { viewMode, staleChannelDays } = useStore();

  // Defensive: filter out invalid subscriptions to prevent crashes
  const validSubscriptions = subscriptions.filter(
    (channel): channel is typeof channel & { id: string; title: string } => {
      if (!channel || !channel.id || !channel.title) {
        console.warn("Invalid subscription found:", channel);
        return false;
      }
      return true;
    },
  );

  const subscriptionGroups =
    groups ??
    Array.from(
      new Set([
        ...validSubscriptions
          .map((channel) => channel.group?.trim())
          .filter((group): group is string => Boolean(group)),
      ]),
    ).sort((a, b) => a.localeCompare(b));

  const groupedSubscriptions =
    selectedGroup === "all"
      ? validSubscriptions
      : validSubscriptions.filter(
          (channel) => (channel.group || "") === selectedGroup,
        );

  // Stale view: dormant channels only, stalest first. Channels without any
  // archived uploads are "unknown", not stale — they stay hidden from this
  // view instead of being shown as dormant.
  const visibleSubscriptions =
    staleOnly && lastUploadByChannel
      ? filterStaleChannels(
          groupedSubscriptions,
          lastUploadByChannel,
          staleChannelDays,
        )
      : groupedSubscriptions;
  const unknownUploadCount =
    staleOnly && lastUploadByChannel
      ? countChannelsWithoutUploadData(
          groupedSubscriptions,
          lastUploadByChannel,
        )
      : 0;

  if (isLoading) {
    return (
      <div className="px-4">
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              : "flex flex-col gap-4"
          }
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} index={i} />
          ))}
        </div>
      </div>
    );
  }

  if (visibleSubscriptions.length === 0) {
    const isEmptyGroup = selectedGroup !== "all";

    if (staleOnly) {
      return (
        <EmptyState
          icon={Grid3x3}
          iconName="subscriptions"
          title="No stale channels"
          detail={
            unknownUploadCount > 0
              ? `No channel has been dormant for ${staleChannelDays}+ days. ${unknownUploadCount} channel${unknownUploadCount === 1 ? "" : "s"} without upload data ${unknownUploadCount === 1 ? "is" : "are"} hidden from this view.`
              : `No channel has been dormant for ${staleChannelDays}+ days.`
          }
        />
      );
    }

    return (
      <EmptyState
        icon={Grid3x3}
        iconName="subscriptions"
        title={
          isEmptyGroup
            ? `No subscriptions in ${selectedGroup}`
            : "No subscriptions found"
        }
        detail={
          isEmptyGroup
            ? "This group is empty. View all subscriptions to choose another group."
            : "Subscribe to channels to see them here."
        }
        action={
          isEmptyGroup && onClearGroup ? (
            <EmptyStateAction onClick={onClearGroup}>
              Show all subscriptions
            </EmptyStateAction>
          ) : undefined
        }
      />
    );
  }

  const handleRemove = async (channelId: string) => {
    const removedChannel = rawSubscriptions.find((s) => s.id === channelId);
    await removeSubscription(channelId);
    if (removedChannel) {
      toast.success(`Removed ${removedChannel.title}`, {
        description: "Channel removed from subscriptions",
        action: {
          label: "Undo",
          onClick: async () => {
            await addSubscriptions([removedChannel]);
            toast.success("Channel restored");
          },
        },
      });
    }
  };

  const handleFavorite = async (channelId: string) => {
    const channel = validSubscriptions.find((s) => s.id === channelId);
    const wasFavorite = channel?.isFavorite;
    await toggleFavorite(channelId);
    if (channel) {
      toast.success(
        wasFavorite
          ? `Removed ${channel.title} from favorites`
          : `Added ${channel.title} to favorites`,
      );
    }
  };

  const handleMute = async (channelId: string) => {
    const channel = validSubscriptions.find((s) => s.id === channelId);
    const wasMuted = channel?.isMuted;
    await toggleMute(channelId);
    if (channel) {
      toast.success(
        wasMuted ? `Unmuted ${channel.title}` : `Muted ${channel.title}`,
      );
    }
  };

  return (
    <div
      data-testid="subscriptions-list"
      className="px-4 bg-gray-50 dark:bg-ios-950"
    >
      {viewMode === "compact" ? (
        <CompactSubscriptionsList
          channels={visibleSubscriptions}
          selectable={selectable}
          selectedChannelIds={selectedChannelIds}
          onToggleSelect={onToggleSelect}
          onRemove={handleRemove}
          onToggleFavorite={handleFavorite}
          onToggleMute={handleMute}
        />
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-2 gap-3 pb-8 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5"
              : "flex flex-col gap-4 pb-8"
          }
        >
          {visibleSubscriptions.map((channel, index) => (
            <SubscriptionCard
              key={channel.id}
              channel={channel}
              index={index}
              groups={subscriptionGroups}
              selectable={selectable}
              selected={selectedChannelIds?.has(channel.id) ?? false}
              onToggleSelect={onToggleSelect}
              lastUploadAt={
                staleOnly ? lastUploadByChannel?.get(channel.id) : undefined
              }
              onRemove={handleRemove}
              onToggleFavorite={handleFavorite}
              onToggleMute={handleMute}
              onSetGroup={async (channelId, group) => {
                await setSubscriptionGroup(channelId, group);
                const channel = validSubscriptions.find(
                  (s) => s.id === channelId,
                );
                if (channel) {
                  toast.success(
                    group
                      ? `Moved ${channel.title} to ${group}`
                      : `Removed ${channel.title} from groups`,
                  );
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
