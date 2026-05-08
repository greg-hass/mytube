import { describe, expect, it } from 'vitest';
import { mergeRemoteSubscriptionMetadata } from './subscription-sync';
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
});
