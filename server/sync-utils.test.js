import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { mergeIncomingSubscriptions, removeSensitiveSyncSettings } = require('./sync-utils');

describe('mergeIncomingSubscriptions', () => {
    it('preserves enriched server thumbnails when incoming sync has a placeholder', () => {
        const existing = [
            {
                id: 'UC123',
                title: 'Server Title',
                thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
                description: 'Server description',
            },
        ];
        const incoming = [
            {
                id: 'UC123',
                title: 'Local Title',
                thumbnail: 'data:image/svg+xml,%3Csvg%3Egray%3C/svg%3E',
                description: '',
            },
        ];

        const merged = mergeIncomingSubscriptions(incoming, existing, {});

        expect(merged).toEqual([
            {
                id: 'UC123',
                title: 'Local Title',
                thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
                description: 'Server description',
            },
        ]);
    });

    it('keeps incoming channel groups during sync', () => {
        const existing = [
            {
                id: 'UC123',
                title: 'Server Title',
                thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
                group: 'Old group',
            },
        ];
        const incoming = [
            {
                id: 'UC123',
                title: 'Local Title',
                thumbnail: '',
                group: 'Linux',
            },
        ];

        const merged = mergeIncomingSubscriptions(incoming, existing, {});

        expect(merged).toEqual([
            {
                id: 'UC123',
                title: 'Local Title',
                thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
                description: '',
                group: 'Linux',
            },
        ]);
    });

    it('keeps existing channel groups when incoming sync has no group', () => {
        const existing = [
            {
                id: 'UC123',
                title: 'Server Title',
                thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
                group: 'Linux',
            },
        ];
        const incoming = [
            {
                id: 'UC123',
                title: 'Local Title',
                thumbnail: '',
            },
        ];

        const merged = mergeIncomingSubscriptions(incoming, existing, {});

        expect(merged).toEqual([
            {
                id: 'UC123',
                title: 'Local Title',
                thumbnail: 'https://yt3.googleusercontent.com/avatar=s900-c-k-c0x00ffffff-no-rj',
                description: '',
                group: 'Linux',
            },
        ]);
    });
});

describe('removeSensitiveSyncSettings', () => {
    it('removes YouTube API keys before sync data is stored or returned', () => {
        const sanitized = removeSensitiveSyncSettings({
            settings: {
                apiKey: 'do-not-sync',
                searchQuery: 'linux',
                quotaUsed: 4,
            },
            subscriptions: [],
        });

        expect(sanitized).toEqual({
            settings: {
                searchQuery: 'linux',
                quotaUsed: 4,
            },
            subscriptions: [],
        });
    });
});
