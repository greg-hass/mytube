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

    return {
      ...localSub,
      title: remoteSub.title || localSub.title,
      description: remoteSub.description || localSub.description,
      thumbnail: isUsefulThumbnail(remoteSub.thumbnail)
        ? remoteSub.thumbnail
        : localSub.thumbnail,
    };
  });
}

export function hasPlaceholderThumbnail(subscription: StoredSubscription): boolean {
  return !isUsefulThumbnail(subscription.thumbnail);
}
