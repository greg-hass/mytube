import type { StoredSubscription } from './indexeddb';

export function isUsefulThumbnail(thumbnail?: string): boolean {
  return Boolean(
    thumbnail &&
    !thumbnail.startsWith('data:') &&
    !thumbnail.includes('ui-avatars.com')
  );
}

export function mergeRemoteSubscriptionMetadata(
  localSubscriptions: StoredSubscription[],
  remoteSubscriptions: StoredSubscription[]
): StoredSubscription[] {
  const remoteById = new Map(remoteSubscriptions.map((sub) => [sub.id, sub]));

  return localSubscriptions.map((localSub) => {
    const remoteSub = remoteById.get(localSub.id);
    if (!remoteSub) return localSub;

    const mergedSub: StoredSubscription = {
      ...localSub,
      title: remoteSub.title || localSub.title,
      description: remoteSub.description || localSub.description,
      thumbnail: isUsefulThumbnail(remoteSub.thumbnail)
        ? remoteSub.thumbnail
        : localSub.thumbnail,
    };

    const group = localSub.group || remoteSub.group;
    if (group) mergedSub.group = group;

    return mergedSub;
  });
}

export function hasPlaceholderThumbnail(subscription: StoredSubscription): boolean {
  return !isUsefulThumbnail(subscription.thumbnail);
}

export type SubscriptionTombstone = {
  id: string;
  revision: number;
};

export function applySubscriptionTombstones(
  subscriptions: StoredSubscription[],
  tombstones: SubscriptionTombstone[] = []
): StoredSubscription[] {
  const tombstonedIds = new Set(tombstones.map((tombstone) => tombstone.id));
  if (tombstonedIds.size === 0) return subscriptions;
  return subscriptions.filter((subscription) => !tombstonedIds.has(subscription.id));
}

export function resolveWatchedVideoSync(
  localWatched: string[],
  remoteWatched: string[],
  { importRemote }: { importRemote: boolean }
) {
  if (!importRemote) {
    return Array.from(new Set(localWatched));
  }

  return Array.from(new Set([...localWatched, ...remoteWatched]));
}

export function areStringSetsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}
