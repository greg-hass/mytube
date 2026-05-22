import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createSqliteStore } = require('./sqlite-store');

let tempDir;
let store;

const defaultData = { subscriptions: [], settings: {}, watchedVideos: [], redirects: {} };
const defaultVideoCache = { videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0, channelRefreshes: {} };

describe('sqlite store', () => {
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-sqlite-store-'));
    });

    afterEach(async () => {
        store?.close();
        store = null;
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('imports legacy JSON state and cached videos without deleting source files', async () => {
        const legacyDataFile = path.join(tempDir, 'db.json');
        const legacyVideosFile = path.join(tempDir, 'videos.json');
        await fs.writeFile(legacyDataFile, JSON.stringify({
            subscriptions: [{ id: 'UC123', title: 'Channel', addedAt: 1 }],
            settings: { searchQuery: 'linux' },
            watchedVideos: ['video-1'],
            redirects: { handle_channel: 'UC123' },
        }));
        await fs.writeFile(legacyVideosFile, JSON.stringify({
            videos: [{ id: 'video-1', channelId: 'UC123', publishedAt: '2026-05-22T12:00:00.000Z', title: 'Video' }],
            lastUpdated: '2026-05-22T12:05:00.000Z',
            totalChannels: 1,
            totalVideos: 1,
            channelRefreshes: { UC123: { lastSuccessfulFetchAt: '2026-05-22T12:05:00.000Z' } },
        }));

        store = createSqliteStore({
            databaseFile: path.join(tempDir, 'youtube-subscriptions.sqlite'),
            legacyDataFile,
            legacyVideosFile,
        });
        await store.init({ defaultData, defaultVideoCache });

        await expect(store.readData(defaultData)).resolves.toMatchObject({
            subscriptions: [{ id: 'UC123', title: 'Channel', addedAt: 1 }],
            settings: { searchQuery: 'linux' },
            watchedVideos: ['video-1'],
            redirects: { handle_channel: 'UC123' },
        });
        await expect(store.readVideoCache(defaultVideoCache)).resolves.toMatchObject({
            videos: [{ id: 'video-1', channelId: 'UC123', title: 'Video' }],
            totalChannels: 1,
            totalVideos: 1,
        });
        await expect(fs.access(legacyDataFile)).resolves.toBeUndefined();
        await expect(fs.access(legacyVideosFile)).resolves.toBeUndefined();
    });

    it('creates revisioned subscription tombstones when a sync removes channels', async () => {
        store = createSqliteStore({
            databaseFile: path.join(tempDir, 'youtube-subscriptions.sqlite'),
            legacyDataFile: path.join(tempDir, 'missing-db.json'),
            legacyVideosFile: path.join(tempDir, 'missing-videos.json'),
        });
        await store.init({ defaultData, defaultVideoCache });
        await store.writeData({
            ...defaultData,
            subscriptions: [
                { id: 'UC_KEEP', title: 'Keep' },
                { id: 'UC_DELETE', title: 'Delete' },
            ],
        });

        await store.updateData(defaultData, (data) => ({
            ...data,
            subscriptions: data.subscriptions.filter((subscription) => subscription.id !== 'UC_DELETE'),
        }), { trackSubscriptionChanges: true });

        await expect(store.readData(defaultData)).resolves.toMatchObject({
            subscriptions: [{ id: 'UC_KEEP', title: 'Keep' }],
            syncRevision: 1,
            subscriptionTombstones: [{ id: 'UC_DELETE', revision: 1 }],
        });
    });
});
