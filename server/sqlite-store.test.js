import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const { createSqliteStore } = require("./sqlite-store");

let tempDir;
let store;

const defaultData = {
	subscriptions: [],
	settings: {},
	watchedVideos: [],
	redirects: {},
};
const defaultVideoCache = {
	videos: [],
	lastUpdated: null,
	totalChannels: 0,
	totalVideos: 0,
	channelRefreshes: {},
};

describe("sqlite store", () => {
	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "youtube-sqlite-store-"));
	});

	afterEach(async () => {
		store?.close();
		store = null;
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("imports legacy JSON state and cached videos without deleting source files", async () => {
		const legacyDataFile = path.join(tempDir, "db.json");
		const legacyVideosFile = path.join(tempDir, "videos.json");
		await fs.writeFile(
			legacyDataFile,
			JSON.stringify({
				subscriptions: [{ id: "UC123", title: "Channel", addedAt: 1 }],
				settings: { searchQuery: "linux" },
				watchedVideos: ["video-1"],
				redirects: { handle_channel: "UC123" },
			}),
		);
		await fs.writeFile(
			legacyVideosFile,
			JSON.stringify({
				videos: [
					{
						id: "video-1",
						channelId: "UC123",
						publishedAt: "2026-05-22T12:00:00.000Z",
						title: "Video",
					},
				],
				lastUpdated: "2026-05-22T12:05:00.000Z",
				totalChannels: 1,
				totalVideos: 1,
				channelRefreshes: {
					UC123: { lastSuccessfulFetchAt: "2026-05-22T12:05:00.000Z" },
				},
			}),
		);

		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile,
			legacyVideosFile,
		});
		await store.init({ defaultData, defaultVideoCache });

		await expect(store.readData(defaultData)).resolves.toMatchObject({
			subscriptions: [{ id: "UC123", title: "Channel", addedAt: 1 }],
			settings: { searchQuery: "linux" },
			watchedVideos: ["video-1"],
			redirects: { handle_channel: "UC123" },
		});
		await expect(
			store.readVideoCache(defaultVideoCache),
		).resolves.toMatchObject({
			videos: [{ id: "video-1", channelId: "UC123", title: "Video" }],
			totalChannels: 1,
			totalVideos: 1,
		});
		await expect(fs.access(legacyDataFile)).resolves.toBeUndefined();
		await expect(fs.access(legacyVideosFile)).resolves.toBeUndefined();
	});

	it("copies a legacy sqlite database into the new default location when needed", async () => {
		const legacyDatabaseFile = path.join(
			tempDir,
			"youtube-subscriptions.sqlite",
		);
		const databaseFile = path.join(tempDir, "mytube.sqlite");
		const legacyDb = new Database(legacyDatabaseFile);
		legacyDb.exec(`
			CREATE TABLE app_state (
				key TEXT PRIMARY KEY NOT NULL,
				value_json TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			INSERT INTO app_state (key, value_json, updated_at)
			VALUES ('custom_marker', '"legacy"', '2026-06-23T00:00:00.000Z');
		`);
		legacyDb.close();

		store = createSqliteStore({
			databaseFile,
			legacyDatabaseFile,
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });

		const copiedDb = new Database(databaseFile, { readonly: true });
		try {
			expect(
				copiedDb
					.prepare(
						"SELECT value_json FROM app_state WHERE key = 'custom_marker'",
					)
					.get().value_json,
			).toBe('"legacy"');
		} finally {
			copiedDb.close();
		}

		await expect(fs.access(legacyDatabaseFile)).resolves.toBeUndefined();
	});

	it("creates revisioned subscription tombstones when a sync removes channels", async () => {
		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });
		await store.writeData({
			...defaultData,
			subscriptions: [
				{ id: "UC_KEEP", title: "Keep" },
				{ id: "UC_DELETE", title: "Delete" },
			],
		});
		const revisionBeforeRemoval = store.getRevision();

		await store.updateData(
			defaultData,
			(data) => ({
				...data,
				subscriptions: data.subscriptions.filter(
					(subscription) => subscription.id !== "UC_DELETE",
				),
			}),
			{ trackSubscriptionChanges: true },
		);

		await expect(store.readData(defaultData)).resolves.toMatchObject({
			subscriptions: [{ id: "UC_KEEP", title: "Keep" }],
			subscriptionTombstones: [
				{ id: "UC_DELETE", revision: revisionBeforeRemoval + 1 },
			],
		});
		expect(store.getRevision()).toBe(revisionBeforeRemoval + 1);
	});

	it("bumps the sync revision on every writeData call", async () => {
		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });

		const baseline = store.getRevision();

		await store.writeData({
			...defaultData,
			settings: { searchQuery: "rust" },
		});
		expect(store.getRevision()).toBe(baseline + 1);

		await store.writeData({
			...defaultData,
			settings: { searchQuery: "golang" },
		});
		expect(store.getRevision()).toBe(baseline + 2);

		const snapshot = await store.readData(defaultData);
		expect(snapshot.syncRevision).toBe(baseline + 2);
	});

	it("keeps the sync revision monotonic across updateData and writeData", async () => {
		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });

		await store.updateData(defaultData, (data) => ({
			...data,
			settings: { sortBy: "name" },
		}));
		const afterUpdate = store.getRevision();

		await store.writeData({ ...defaultData, settings: { sortBy: "recent" } });
		const afterWrite = store.getRevision();

		expect(afterUpdate).toBeGreaterThan(0);
		expect(afterWrite).toBe(afterUpdate + 1);
	});

	it("does not let client-supplied syncRevision values roll the revision backwards", async () => {
		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });

		await store.writeData({ ...defaultData, settings: { sortBy: "name" } });
		const revision = store.getRevision();
		expect(revision).toBeGreaterThan(0);

		await store.writeData({
			...defaultData,
			settings: { sortBy: "recent" },
			syncRevision: 0,
		});

		expect(store.getRevision()).toBe(revision + 1);
	});

	it("bumps sync_revision when updateSubscriptionField is called", async () => {
		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });

		// Add a subscription via updateData (bumps revision to 1)
		await store.updateData(defaultData, (data) => ({
			...data,
			subscriptions: [{ id: "UC001", title: "Test Channel" }],
		}));

		const before = store.getRevision();
		store.updateSubscriptionField("UC001", "isMuted", true);
		const after = store.getRevision();
		expect(after).toBeGreaterThan(before);

		// Verify the field was actually updated
		const data = await store.readData(defaultData);
		expect(data.subscriptions[0].isMuted).toBe(true);
	});

	it("writeData removes subscriptions that are no longer in the incoming data", async () => {
		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });

		await store.writeData({
			...defaultData,
			subscriptions: [
				{ id: "UC_AAA", title: "Channel A" },
				{ id: "UC_BBB", title: "Channel B" },
			],
		});

		let data = await store.readData(defaultData);
		expect(data.subscriptions).toHaveLength(2);

		await store.writeData({
			...defaultData,
			subscriptions: [{ id: "UC_AAA", title: "Channel A" }],
		});

		data = await store.readData(defaultData);
		expect(data.subscriptions).toHaveLength(1);
		expect(data.subscriptions[0].id).toBe("UC_AAA");
	});

	it("writeVideoCache removes videos that are no longer in the incoming cache", async () => {
		store = createSqliteStore({
			databaseFile: path.join(tempDir, "youtube-subscriptions.sqlite"),
			legacyDataFile: path.join(tempDir, "missing-db.json"),
			legacyVideosFile: path.join(tempDir, "missing-videos.json"),
		});
		await store.init({ defaultData, defaultVideoCache });

		await store.writeVideoCache({
			videos: [
				{
					id: "vid-1",
					channelId: "UC123",
					publishedAt: "2026-06-22T10:00:00.000Z",
					title: "Video 1",
				},
				{
					id: "vid-2",
					channelId: "UC123",
					publishedAt: "2026-06-22T11:00:00.000Z",
					title: "Video 2",
				},
			],
			lastUpdated: "2026-06-22T12:00:00.000Z",
			totalChannels: 1,
			totalVideos: 2,
			channelRefreshes: {},
		});

		let cache = await store.readVideoCache(defaultVideoCache);
		expect(cache.videos).toHaveLength(2);

		await store.writeVideoCache({
			videos: [
				{
					id: "vid-1",
					channelId: "UC123",
					publishedAt: "2026-06-22T10:00:00.000Z",
					title: "Video 1",
				},
			],
			lastUpdated: "2026-06-22T13:00:00.000Z",
			totalChannels: 1,
			totalVideos: 1,
			channelRefreshes: {},
		});

		cache = await store.readVideoCache(defaultVideoCache);
		expect(cache.videos).toHaveLength(1);
		expect(cache.videos[0].id).toBe("vid-1");
	});
});
