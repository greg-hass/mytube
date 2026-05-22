import { describe, expect, it } from 'vitest';
import { applySubscriptionTombstones, areStringSetsEqual, mergeRemoteSubscriptionMetadata, resolveWatchedVideoSync } from './subscription-sync';
import type { StoredSubscription } from './indexeddb';

describe('mergeRemoteSubscriptionMetadata', () => {
  it('replaces local placeholder thumbnails with server thumbnails', () => {
    const local: StoredSubscription[] = [
      {
        id: 'UC123',
        title: 'Make It Work',
        addedAt: 1,
        thumbnail: 'data:image/svg+xml,%3Csvg%3EMI%3C/svg%3E',
      },
    ];
    const remote: StoredSubscription[] = [
      {
        id: 'UC123',
        title: 'Make It Work',
        addedAt: 1,
        thumbnail: 'https://yt3.googleusercontent.com/real-avatar=s900-c-k-c0x00ffffff-no-rj',
      },
    ];

    expect(mergeRemoteSubscriptionMetadata(local, remote)).toEqual([
      {
        id: 'UC123',
        title: 'Make It Work',
        addedAt: 1,
        thumbnail: 'https://yt3.googleusercontent.com/real-avatar=s900-c-k-c0x00ffffff-no-rj',
      },
    ]);
  });

  it('keeps local channel grouping while merging remote metadata', () => {
    const local: StoredSubscription[] = [
      {
        id: 'UC123',
        title: 'Local Title',
        addedAt: 1,
        thumbnail: '',
        group: 'Linux',
      },
    ];
    const remote: StoredSubscription[] = [
      {
        id: 'UC123',
        title: 'Remote Title',
        addedAt: 1,
        thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
        group: 'News',
      },
    ];

    expect(mergeRemoteSubscriptionMetadata(local, remote)).toEqual([
      {
        id: 'UC123',
        title: 'Remote Title',
        addedAt: 1,
        thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
        group: 'Linux',
      },
    ]);
  });

  it('uses remote channel grouping when the local channel has no group yet', () => {
    const local: StoredSubscription[] = [
      {
        id: 'UC123',
        title: 'Local Title',
        addedAt: 1,
        thumbnail: '',
      },
    ];
    const remote: StoredSubscription[] = [
      {
        id: 'UC123',
        title: 'Remote Title',
        addedAt: 1,
        thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
        group: 'News',
      },
    ];

    expect(mergeRemoteSubscriptionMetadata(local, remote)).toEqual([
      {
        id: 'UC123',
        title: 'Remote Title',
        addedAt: 1,
        thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
        group: 'News',
      },
    ]);
  });
});

describe('resolveWatchedVideoSync', () => {
  it('imports remote watched videos during initial sync', () => {
    expect(resolveWatchedVideoSync(['local-1'], ['remote-1'], { importRemote: true }).sort()).toEqual([
      'local-1',
      'remote-1',
    ]);
  });

  it('keeps local watched state authoritative after initial sync so unwatch is not re-added', () => {
    expect(resolveWatchedVideoSync([], ['accidentally-watched'], { importRemote: false })).toEqual([]);
  });
});

describe('areStringSetsEqual', () => {
  it('compares watched ids without depending on order', () => {
    expect(areStringSetsEqual(['one', 'two'], ['two', 'one'])).toBe(true);
    expect(areStringSetsEqual(['one'], ['one', 'two'])).toBe(false);
  });
});

describe('applySubscriptionTombstones', () => {
  it('removes tombstoned subscriptions before local and remote lists are merged', () => {
    const subscriptions: StoredSubscription[] = [
      { id: 'UC_KEEP', title: 'Keep', addedAt: 1 },
      { id: 'UC_DELETE', title: 'Delete', addedAt: 2 },
    ];

    expect(applySubscriptionTombstones(subscriptions, [{ id: 'UC_DELETE', revision: 2 }])).toEqual([
      { id: 'UC_KEEP', title: 'Keep', addedAt: 1 },
    ]);
  });
});
