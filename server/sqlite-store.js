const fsPromises = require("fs").promises;
const path = require("path");
const Database = require("better-sqlite3");
const { runMigrations } = require("./migrations-runner");

const ISO_NOW = () => new Date().toISOString();

function parseJson(value, fallback) {
	if (typeof value !== "string") return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}

function createSqliteStore({ databaseFile, legacyDataFile, legacyVideosFile }) {
	let db = null;

	function getDb() {
		if (!db) throw new Error("SQLite store has not been initialized");
		return db;
	}

	function writeAppState(key, value, updatedAt = ISO_NOW()) {
		getDb()
			.prepare(`
            INSERT INTO app_state (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
        `)
			.run(key, JSON.stringify(value), updatedAt);
	}

	function readAppState(key, fallback) {
		const row = getDb()
			.prepare("SELECT value_json FROM app_state WHERE key = ?")
			.get(key);
		return row ? parseJson(row.value_json, fallback) : fallback;
	}

	function getSubscriptionRows() {
		return getDb()
			.prepare(
				"SELECT value_json FROM subscriptions ORDER BY updated_at ASC, id ASC",
			)
			.all()
			.map((row) => parseJson(row.value_json, null))
			.filter(Boolean);
	}

	function getTombstones() {
		return getDb()
			.prepare(
				"SELECT id, revision, deleted_at AS deletedAt FROM subscription_tombstones ORDER BY revision ASC, id ASC",
			)
			.all();
	}

	function getDataSnapshot(fallback) {
		const metadata = readAppState("data_metadata", {});
		return {
			...fallback,
			...metadata,
			subscriptions: getSubscriptionRows(),
			settings: readAppState("settings", fallback.settings || {}),
			watchedVideos: readAppState(
				"watched_videos",
				fallback.watchedVideos || [],
			),
			redirects: readAppState("redirects", fallback.redirects || {}),
			syncRevision: readAppState("sync_revision", 0),
			subscriptionTombstones: getTombstones(),
		};
	}

	function upsertSubscriptions(subscriptions, updatedAt) {
		const database = getDb();
		const upsert = database.prepare(`
            INSERT INTO subscriptions (id, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
        `);
		const clearTombstone = database.prepare(
			"DELETE FROM subscription_tombstones WHERE id = ?",
		);

		for (const subscription of subscriptions || []) {
			if (!subscription?.id) continue;
			upsert.run(subscription.id, JSON.stringify(subscription), updatedAt);
			clearTombstone.run(subscription.id);
		}
	}

	function deleteSubscriptions(ids) {
		if (!ids || ids.length === 0) return;
		const database = getDb();
		const del = database.prepare("DELETE FROM subscriptions WHERE id = ?");
		for (const id of ids) {
			del.run(id);
		}
	}

	function getRevision() {
		return Number(readAppState("sync_revision", 0)) || 0;
	}

	function writeDataSnapshot(
		data,
		{ previousSubscriptions = null, trackSubscriptionChanges = false } = {},
	) {
		const database = getDb();
		const updatedAt = ISO_NOW();
		const nextSubscriptions = Array.isArray(data.subscriptions)
			? data.subscriptions
			: [];
		const nextIds = new Set(
			nextSubscriptions.map((subscription) => subscription.id),
		);
		// When previousSubscriptions is not provided (writeData path),
		// compute removedIds from the current DB state so stale rows are evicted.
		const previousList =
			previousSubscriptions !== null
				? previousSubscriptions
				: getSubscriptionRows();
		const removedIds = previousList
			.map((subscription) => subscription.id)
			.filter((id) => id && !nextIds.has(id));

		const write = database.transaction(() => {
			upsertSubscriptions(nextSubscriptions, updatedAt);
			deleteSubscriptions(removedIds);
			const {
				subscriptions,
				settings,
				watchedVideos,
				redirects,
				syncRevision,
				subscriptionTombstones,
				...metadata
			} = data;
			writeAppState("data_metadata", metadata, updatedAt);
			writeAppState("settings", settings || {}, updatedAt);
			writeAppState("watched_videos", watchedVideos || [], updatedAt);
			writeAppState("redirects", redirects || {}, updatedAt);

			const nextRevision = getRevision() + 1;

			if (trackSubscriptionChanges && removedIds.length > 0) {
				const insertTombstone = database.prepare(`
                    INSERT INTO subscription_tombstones (id, revision, deleted_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        revision = excluded.revision,
                        deleted_at = excluded.deleted_at
                `);
				for (const id of removedIds) {
					insertTombstone.run(id, nextRevision, updatedAt);
				}
			}

			writeAppState("sync_revision", nextRevision, updatedAt);
		});

		write();
	}

	function getVideoRows() {
		return getDb()
			.prepare(
				"SELECT value_json FROM videos ORDER BY published_at DESC, id ASC",
			)
			.all()
			.map((row) => parseJson(row.value_json, null))
			.filter(Boolean);
	}

	function getChannelRefreshes() {
		const rows = getDb()
			.prepare("SELECT channel_id, value_json FROM channel_refreshes")
			.all();
		return Object.fromEntries(
			rows.map((row) => [row.channel_id, parseJson(row.value_json, {})]),
		);
	}

	function getVideoCacheSnapshot(fallback) {
		return {
			...fallback,
			...readAppState("video_cache_metadata", {}),
			videos: getVideoRows(),
			channelRefreshes: getChannelRefreshes(),
		};
	}

	function writeVideoCacheSnapshot(cache) {
		const database = getDb();
		const updatedAt = ISO_NOW();
		const write = database.transaction(() => {
			const upsertVideo = database.prepare(`
                INSERT INTO videos (id, channel_id, published_at, value_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    channel_id = excluded.channel_id,
                    published_at = excluded.published_at,
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
            `);
			for (const video of cache.videos || []) {
				if (!video?.id || !video.channelId) continue;
				upsertVideo.run(
					video.id,
					video.channelId,
					video.publishedAt || null,
					JSON.stringify(video),
					updatedAt,
				);
			}

			const upsertRefresh = database.prepare(`
                INSERT INTO channel_refreshes (channel_id, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(channel_id) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
            `);
			for (const [channelId, refresh] of Object.entries(
				cache.channelRefreshes || {},
			)) {
				upsertRefresh.run(channelId, JSON.stringify(refresh), updatedAt);
			}

			// Evict rows no longer in the incoming cache by comparing actual IDs.
			// json_each is immune to timestamp collisions and is a single statement.
			const validVideoIds = JSON.stringify(
				(cache.videos || []).filter((v) => v?.id).map((v) => v.id),
			);
			database
				.prepare(
					"DELETE FROM videos WHERE id NOT IN (SELECT value FROM json_each(?, '$'))",
				)
				.run(validVideoIds);
			const validChannelIds = JSON.stringify(
				Object.keys(cache.channelRefreshes || {}),
			);
			database
				.prepare(
					"DELETE FROM channel_refreshes WHERE channel_id NOT IN (SELECT value FROM json_each(?, '$'))",
				)
				.run(validChannelIds);

			const { videos, channelRefreshes, ...metadata } = cache;
			writeAppState("video_cache_metadata", metadata, updatedAt);
		});

		write();
	}

	async function readLegacyJson(file, fallback) {
		try {
			return JSON.parse(await fsPromises.readFile(file, "utf8"));
		} catch (error) {
			if (error.code === "ENOENT") return fallback;
			throw error;
		}
	}

	async function importLegacyJson({ defaultData, defaultVideoCache }) {
		if (readAppState("legacy_imported", false)) return;

		const database = getDb();
		const hasState =
			database.prepare("SELECT 1 FROM app_state LIMIT 1").get() ||
			database.prepare("SELECT 1 FROM subscriptions LIMIT 1").get() ||
			database.prepare("SELECT 1 FROM videos LIMIT 1").get();
		if (!hasState) {
			writeDataSnapshot(await readLegacyJson(legacyDataFile, defaultData));
			writeVideoCacheSnapshot(
				await readLegacyJson(legacyVideosFile, defaultVideoCache),
			);
		}

		writeAppState("legacy_imported", true);
	}

	function applySubscriptionFieldUpdate(id, field, value) {
		const database = getDb();
		database
			.prepare(`
            UPDATE subscriptions SET value_json = json_set(value_json, ?, json(?)) WHERE id = ?
        `)
			.run(`$.${field}`, JSON.stringify(value), id);
	}

	return {
		async init({ defaultData, defaultVideoCache }) {
			await fsPromises.mkdir(path.dirname(databaseFile), { recursive: true });
			db = new Database(databaseFile);
			db.pragma("foreign_keys = ON");
			db.pragma("journal_mode = WAL");
			runMigrations(db);
			await importLegacyJson({ defaultData, defaultVideoCache });
		},
		getRevision() {
			return getRevision();
		},
		async readData(fallback) {
			return getDataSnapshot(fallback);
		},
		async writeData(data) {
			writeDataSnapshot(data);
			return getDataSnapshot(data);
		},
		async updateData(fallback, updater, options = {}) {
			const current = getDataSnapshot(fallback);
			const updated = await updater(current);
			const nextData = updated === undefined ? current : updated;
			writeDataSnapshot(nextData, {
				previousSubscriptions: current.subscriptions,
				...options,
			});
			return getDataSnapshot(fallback);
		},
		async readVideoCache(fallback) {
			return getVideoCacheSnapshot(fallback);
		},
		async writeVideoCache(cache) {
			writeVideoCacheSnapshot(cache);
			return getVideoCacheSnapshot(cache);
		},
		updateSubscriptionField(id, field, value) {
			applySubscriptionFieldUpdate(id, field, value);
		},
		close() {
			db?.close();
			db = null;
		},
	};
}

module.exports = { createSqliteStore };
