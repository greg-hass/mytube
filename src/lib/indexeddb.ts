/**
 * IndexedDB wrapper for YouTube subscriptions and video cache
 *
 * Stores:
 * - subscriptions: Channel data imported from OPML
 * - videos-cache: Cached videos from RSS feeds with TTL
 */

const DB_NAME = "mytube-db";
const LEGACY_DB_NAME = "youtube-subscriptions-db";
const DB_VERSION = 1;

// Store names
const SUBSCRIPTIONS_STORE = "subscriptions";
const VIDEOS_CACHE_STORE = "videos-cache";

/**
 * Subscription stored in IndexedDB
 */
export interface StoredSubscription {
	id: string; // Channel ID (e.g., "UCxxx")
	title: string; // Channel name
	thumbnail?: string; // Channel avatar (fetched from RSS later)
	addedAt: number; // Timestamp when imported
	customUrl?: string; // Channel custom URL
	description?: string; // Channel description
	isFavorite?: boolean; // Whether channel is marked as favorite
	isMuted?: boolean; // Whether channel is muted from latest feed
	group?: string; // Optional user-defined channel group
}

/**
 * Cached video from RSS feed
 */
export interface CachedVideo {
	id: string; // Video ID
	title: string; // Video title
	channelId: string; // Channel ID this video belongs to
	channelTitle: string; // Channel name
	publishedAt: string; // ISO 8601 timestamp
	thumbnail: string; // Video thumbnail URL
	description: string; // Video description
	cachedAt: number; // Timestamp when we fetched this
}

function createSchema(db: IDBDatabase): void {
	// Create subscriptions store if it doesn't exist
	if (!db.objectStoreNames.contains(SUBSCRIPTIONS_STORE)) {
		const subscriptionsStore = db.createObjectStore(SUBSCRIPTIONS_STORE, {
			keyPath: "id",
		});
		// Index by addedAt for sorting
		subscriptionsStore.createIndex("addedAt", "addedAt", { unique: false });
	}

	// Create videos cache store if it doesn't exist
	if (!db.objectStoreNames.contains(VIDEOS_CACHE_STORE)) {
		const videosStore = db.createObjectStore(VIDEOS_CACHE_STORE, {
			keyPath: "id",
		});
		// Index by channelId for fetching videos by channel
		videosStore.createIndex("channelId", "channelId", { unique: false });
		// Index by cachedAt for TTL cleanup
		videosStore.createIndex("cachedAt", "cachedAt", { unique: false });
		// Index by publishedAt for sorting
		videosStore.createIndex("publishedAt", "publishedAt", { unique: false });
	}
}

function openDatabase(name: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name, DB_VERSION);

		request.onerror = () => {
			reject(new Error(`Failed to open database: ${request.error?.message}`));
		};

		request.onsuccess = () => {
			resolve(request.result);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			createSchema(db);
		};
	});
}

let dbPromise: Promise<IDBDatabase> | null = null;
let legacyMigrationDone = false;

/**
 * Get database connection (cached singleton)
 */
async function getDB(): Promise<IDBDatabase> {
	if (!dbPromise) {
		dbPromise = openDatabase(DB_NAME);
	}
	const db = await dbPromise;
	if (!legacyMigrationDone) {
		await migrateLegacyDatabaseIfNeeded(db);
		legacyMigrationDone = true;
	}
	return db;
}

async function databaseExists(name: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(name, DB_VERSION);
		let didUpgrade = false;

		request.onupgradeneeded = () => {
			didUpgrade = true;
			request.transaction?.abort();
		};

		request.onsuccess = () => {
			request.result.close();
			resolve(true);
		};

		request.onerror = () => {
			if (didUpgrade) {
				resolve(false);
				return;
			}
			reject(new Error(`Failed to probe database: ${request.error?.message}`));
		};
	});
}

function readAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
	return new Promise((resolve, reject) => {
		try {
			const transaction = db.transaction(storeName, "readonly");
			const store = transaction.objectStore(storeName);
			const request = store.getAll();

			request.onsuccess = () => {
				resolve(request.result as T[]);
			};

			request.onerror = () => {
				reject(
					new Error(`Failed to read ${storeName}: ${request.error?.message}`),
				);
			};
		} catch (error) {
			reject(error);
		}
	});
}

function writeAllToStore<T>(
	db: IDBDatabase,
	storeName: string,
	rows: T[],
): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const transaction = db.transaction(storeName, "readwrite");
			const store = transaction.objectStore(storeName);

			for (const row of rows) {
				store.put(row);
			}

			transaction.oncomplete = () => {
				resolve();
			};

			transaction.onerror = () => {
				reject(
					new Error(
						`Failed to write ${storeName}: ${transaction.error?.message}`,
					),
				);
			};
		} catch (error) {
			reject(error);
		}
	});
}

async function hasDatabaseContent(db: IDBDatabase): Promise<boolean> {
	const [subscriptions, videos] = await Promise.all([
		readAllFromStore<StoredSubscription>(db, SUBSCRIPTIONS_STORE),
		readAllFromStore<CachedVideo>(db, VIDEOS_CACHE_STORE),
	]);

	return subscriptions.length > 0 || videos.length > 0;
}

async function migrateLegacyDatabaseIfNeeded(
	targetDb: IDBDatabase,
): Promise<void> {
	if (targetDb.name !== DB_NAME) return;
	if (!(await databaseExists(LEGACY_DB_NAME))) return;
	if (await hasDatabaseContent(targetDb)) return;

	const legacyDb = await openDatabase(LEGACY_DB_NAME);
	try {
		if (!(await hasDatabaseContent(legacyDb))) return;

		await writeAllToStore(
			targetDb,
			SUBSCRIPTIONS_STORE,
			await readAllFromStore<StoredSubscription>(legacyDb, SUBSCRIPTIONS_STORE),
		);
		await writeAllToStore(
			targetDb,
			VIDEOS_CACHE_STORE,
			await readAllFromStore<CachedVideo>(legacyDb, VIDEOS_CACHE_STORE),
		);
	} finally {
		legacyDb.close();
	}
}

/**
 * Execute a transaction and return result
 */
function executeTransaction<T>(
	storeName: string,
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	return getDB().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				try {
					const transaction = db.transaction(storeName, mode);
					const store = transaction.objectStore(storeName);
					const request = operation(store);

					request.onsuccess = () => {
						resolve(request.result);
					};

					request.onerror = () => {
						reject(new Error(`Transaction failed: ${request.error?.message}`));
					};

					transaction.onerror = () => {
						reject(
							new Error(`Transaction error: ${transaction.error?.message}`),
						);
					};
				} catch (error) {
					reject(error);
				}
			}),
	);
}

/**
 * Add multiple subscriptions to the database
 * Uses a single transaction for better performance
 */
export async function addSubscriptions(
	subscriptions: StoredSubscription[],
): Promise<void> {
	const db = await getDB();
	const transaction = db.transaction(SUBSCRIPTIONS_STORE, "readwrite");
	const store = transaction.objectStore(SUBSCRIPTIONS_STORE);

	return new Promise((resolve, reject) => {
		subscriptions.forEach((subscription) => {
			store.put(subscription);
		});

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(new Error(`Bulk insert failed: ${transaction.error?.message}`));
		};
	});
}

/**
 * Get all subscriptions from the database
 */
export async function getAllSubscriptions(): Promise<StoredSubscription[]> {
	return executeTransaction(SUBSCRIPTIONS_STORE, "readonly", (store) =>
		store.getAll(),
	);
}

/**
 * Get a single subscription by channel ID
 */
export async function getSubscription(
	channelId: string,
): Promise<StoredSubscription | undefined> {
	return executeTransaction(SUBSCRIPTIONS_STORE, "readonly", (store) =>
		store.get(channelId),
	);
}

/**
 * Remove a subscription by channel ID
 */
export async function removeSubscription(channelId: string): Promise<void> {
	await executeTransaction(SUBSCRIPTIONS_STORE, "readwrite", (store) =>
		store.delete(channelId),
	);
}

/**
 * Remove every cached video belonging to a channel, used when the
 * subscription is deleted so no orphaned videos linger on disk.
 */
export async function removeVideosByChannel(channelId: string): Promise<void> {
	const db = await getDB();
	await new Promise<void>((resolve, reject) => {
		try {
			const transaction = db.transaction(VIDEOS_CACHE_STORE, "readwrite");
			const index = transaction.objectStore(VIDEOS_CACHE_STORE).index("channelId");
			const request = index.openCursor(IDBKeyRange.only(channelId));
			request.onsuccess = () => {
				const cursor = request.result;
				if (cursor) {
					cursor.delete();
					cursor.continue();
				}
			};
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
					reject(
						new Error(
							`Failed to remove cached videos: ${transaction.error?.message}`,
						),
					);
		} catch (error) {
			reject(error instanceof Error ? error : new Error(String(error)));
		}
	});
}

/**
 * Update an existing subscription with new information
 */
export async function updateSubscription(
	subscription: StoredSubscription,
): Promise<void> {
	await executeTransaction(SUBSCRIPTIONS_STORE, "readwrite", (store) =>
		store.put(subscription),
	);
}

/**
 * Toggle favorite status for a channel
 */
export async function toggleFavorite(channelId: string): Promise<void> {
	const subscription = await getSubscription(channelId);
	if (subscription) {
		subscription.isFavorite = !subscription.isFavorite;
		await updateSubscription(subscription);
	}
}

/**
 * Toggle mute status for a channel
 */
export async function toggleMute(channelId: string): Promise<void> {
	const subscription = await getSubscription(channelId);
	if (subscription) {
		subscription.isMuted = !subscription.isMuted;
		await updateSubscription(subscription);
	}
}

/**
 * Assign a channel to a user-defined group.
 */
export async function setSubscriptionGroup(
	channelId: string,
	group: string,
): Promise<void> {
	const subscription = await getSubscription(channelId);
	if (subscription) {
		const trimmedGroup = group.trim();
		if (trimmedGroup) {
			subscription.group = trimmedGroup;
		} else {
			delete subscription.group;
		}
		await updateSubscription(subscription);
	}
}

/**
 * Clear all subscriptions from the database
 */
export async function clearAllSubscriptions(): Promise<void> {
	await executeTransaction(SUBSCRIPTIONS_STORE, "readwrite", (store) =>
		store.clear(),
	);
}

/**
 * Get the count of subscriptions
 */
export async function getSubscriptionCount(): Promise<number> {
	return executeTransaction(SUBSCRIPTIONS_STORE, "readonly", (store) =>
		store.count(),
	);
}

/**
 * Clear all cached videos
 */
export async function clearAllCachedVideos(): Promise<void> {
	await executeTransaction(VIDEOS_CACHE_STORE, "readwrite", (store) =>
		store.clear(),
	);
}

/**
 * Delete the entire database (use with caution)
 */
export async function deleteDatabase(): Promise<void> {
	// Close the cached connection so deletion isn't blocked
	if (dbPromise) {
		try {
			const db = await dbPromise;
			db.close();
		} catch {
			// Connection may already be closed
		}
		dbPromise = null;
		legacyMigrationDone = false;
	}

	return new Promise((resolve, reject) => {
		const names = [DB_NAME, LEGACY_DB_NAME];
		let remaining = names.length;
		let settled = false;

		const finish = () => {
			remaining -= 1;
			if (!settled && remaining === 0) {
				settled = true;
				resolve();
			}
		};

		for (const name of names) {
			const request = indexedDB.deleteDatabase(name);

			request.onsuccess = () => {
				finish();
			};

			request.onerror = () => {
				if (settled) return;
				settled = true;
				reject(
					new Error(`Failed to delete database: ${request.error?.message}`),
				);
			};

			request.onblocked = () => {
				if (settled) return;
				settled = true;
				reject(
					new Error(
						`Database deletion blocked for ${name} - close all tabs using this database`,
					),
				);
			};
		}
	});
}

/**
 * Replace a subscription with a new one (handles ID changes)
 * Deletes the old subscription and adds the new one in a transaction
 */
export async function replaceSubscription(
	oldId: string,
	newSubscription: StoredSubscription,
): Promise<void> {
	const db = await getDB();
	const transaction = db.transaction(SUBSCRIPTIONS_STORE, "readwrite");
	const store = transaction.objectStore(SUBSCRIPTIONS_STORE);

	return new Promise((resolve, reject) => {
		// Delete old subscription
		store.delete(oldId);

		// Add new subscription
		store.put(newSubscription);

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(
				new Error(`Replace subscription failed: ${transaction.error?.message}`),
			);
		};
	});
}
