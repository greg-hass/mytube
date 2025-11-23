/**
 * IndexedDB wrapper for YouTube subscriptions and video cache
 *
 * Stores:
 * - subscriptions: Channel data imported from OPML
 * - videos-cache: Cached videos from RSS feeds with TTL
 */

const DB_NAME = 'youtube-subscriptions-db';
const DB_VERSION = 1;

// Store names
const SUBSCRIPTIONS_STORE = 'subscriptions';
const VIDEOS_CACHE_STORE = 'videos-cache';

/**
 * Subscription stored in IndexedDB
 */
export interface StoredSubscription {
  id: string;              // Channel ID (e.g., "UCxxx")
  title: string;           // Channel name
  thumbnail?: string;      // Channel avatar (fetched from RSS later)
  addedAt: number;         // Timestamp when imported
  customUrl?: string;      // Channel custom URL
  description?: string;    // Channel description
  isFavorite?: boolean;    // Whether channel is marked as favorite
}

/**
 * Cached video from RSS feed
 */
export interface CachedVideo {
  id: string;              // Video ID
  title: string;           // Video title
  channelId: string;       // Channel ID this video belongs to
  channelTitle: string;    // Channel name
  publishedAt: string;     // ISO 8601 timestamp
  thumbnail: string;       // Video thumbnail URL
  description: string;     // Video description
  cachedAt: number;        // Timestamp when we fetched this
}

/**
 * Initialize and upgrade database schema
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create subscriptions store if it doesn't exist
      if (!db.objectStoreNames.contains(SUBSCRIPTIONS_STORE)) {
        const subscriptionsStore = db.createObjectStore(SUBSCRIPTIONS_STORE, {
          keyPath: 'id'
        });
        // Index by addedAt for sorting
        subscriptionsStore.createIndex('addedAt', 'addedAt', { unique: false });
      }

      // Create videos cache store if it doesn't exist
      if (!db.objectStoreNames.contains(VIDEOS_CACHE_STORE)) {
        const videosStore = db.createObjectStore(VIDEOS_CACHE_STORE, {
          keyPath: 'id'
        });
        // Index by channelId for fetching videos by channel
        videosStore.createIndex('channelId', 'channelId', { unique: false });
        // Index by cachedAt for TTL cleanup
        videosStore.createIndex('cachedAt', 'cachedAt', { unique: false });
        // Index by publishedAt for sorting
        videosStore.createIndex('publishedAt', 'publishedAt', { unique: false });
      }
    };
  });
}

/**
 * Get database connection
 */
async function getDB(): Promise<IDBDatabase> {
  return initDB();
}

/**
 * Execute a transaction and return result
 */
function executeTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDB();
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
        reject(new Error(`Transaction error: ${transaction.error?.message}`));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Execute a cursor operation
 */
function executeCursor<T>(
  storeName: string,
  operation: (store: IDBObjectStore) => IDBRequest<IDBCursorWithValue | null>,
  processor: (cursor: IDBCursorWithValue) => T
): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDB();
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = operation(store);
      const results: T[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(processor(cursor));
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        reject(new Error(`Cursor operation failed: ${request.error?.message}`));
      };
    } catch (error) {
      reject(error);
    }
  });
}

// ========================================
// Subscription Operations
// ========================================

/**
 * Add a single subscription to the database
 */
export async function addSubscription(subscription: StoredSubscription): Promise<void> {
  await executeTransaction(
    SUBSCRIPTIONS_STORE,
    'readwrite',
    (store) => store.put(subscription)
  );
}

/**
 * Add multiple subscriptions to the database
 * Uses a single transaction for better performance
 */
export async function addSubscriptions(subscriptions: StoredSubscription[]): Promise<void> {
  const db = await getDB();
  const transaction = db.transaction(SUBSCRIPTIONS_STORE, 'readwrite');
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
  return executeTransaction(
    SUBSCRIPTIONS_STORE,
    'readonly',
    (store) => store.getAll()
  );
}

/**
 * Get a single subscription by channel ID
 */
export async function getSubscription(channelId: string): Promise<StoredSubscription | undefined> {
  return executeTransaction(
    SUBSCRIPTIONS_STORE,
    'readonly',
    (store) => store.get(channelId)
  );
}

/**
 * Remove a subscription by channel ID
 */
export async function removeSubscription(channelId: string): Promise<void> {
  await executeTransaction(
    SUBSCRIPTIONS_STORE,
    'readwrite',
    (store) => store.delete(channelId)
  );
}

/**
 * Update an existing subscription with new information
 */
export async function updateSubscription(subscription: StoredSubscription): Promise<void> {
  await executeTransaction(
    SUBSCRIPTIONS_STORE,
    'readwrite',
    (store) => store.put(subscription)
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
 * Get all favorite channels
 */
export async function getFavoriteChannels(): Promise<StoredSubscription[]> {
  const allSubs = await getAllSubscriptions();
  return allSubs.filter(sub => sub.isFavorite === true);
}

/**
 * Clear all subscriptions from the database
 */
export async function clearAllSubscriptions(): Promise<void> {
  await executeTransaction(
    SUBSCRIPTIONS_STORE,
    'readwrite',
    (store) => store.clear()
  );
}

/**
 * Get the count of subscriptions
 */
export async function getSubscriptionCount(): Promise<number> {
  return executeTransaction(
    SUBSCRIPTIONS_STORE,
    'readonly',
    (store) => store.count()
  );
}

// ========================================
// Video Cache Operations
// ========================================

/**
 * Add a single video to the cache
 */
export async function addCachedVideo(video: CachedVideo): Promise<void> {
  await executeTransaction(
    VIDEOS_CACHE_STORE,
    'readwrite',
    (store) => store.put(video)
  );
}

/**
 * Add multiple videos to the cache
 * Uses a single transaction for better performance
 */
export async function addCachedVideos(videos: CachedVideo[]): Promise<void> {
  const db = await getDB();
  const transaction = db.transaction(VIDEOS_CACHE_STORE, 'readwrite');
  const store = transaction.objectStore(VIDEOS_CACHE_STORE);

  return new Promise((resolve, reject) => {
    videos.forEach((video) => {
      store.put(video);
    });

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(new Error(`Bulk video cache insert failed: ${transaction.error?.message}`));
    };
  });
}

/**
 * Get all cached videos
 */
export async function getAllCachedVideos(): Promise<CachedVideo[]> {
  return executeTransaction(
    VIDEOS_CACHE_STORE,
    'readonly',
    (store) => store.getAll()
  );
}

/**
 * Get cached videos for a specific channel
 */
export async function getCachedVideosByChannel(channelId: string): Promise<CachedVideo[]> {
  return executeCursor(
    VIDEOS_CACHE_STORE,
    (store) => store.index('channelId').openCursor(IDBKeyRange.only(channelId)),
    (cursor) => cursor.value as CachedVideo
  );
}

/**
 * Get all cached videos sorted by published date (newest first)
 */
export async function getCachedVideosSorted(): Promise<CachedVideo[]> {
  return executeCursor(
    VIDEOS_CACHE_STORE,
    (store) => store.index('publishedAt').openCursor(null, 'prev'),
    (cursor) => cursor.value as CachedVideo
  );
}

/**
 * Remove a video from cache by video ID
 */
export async function removeCachedVideo(videoId: string): Promise<void> {
  await executeTransaction(
    VIDEOS_CACHE_STORE,
    'readwrite',
    (store) => store.delete(videoId)
  );
}

/**
 * Remove all cached videos for a specific channel
 */
export async function removeCachedVideosByChannel(channelId: string): Promise<void> {
  const db = await getDB();
  const transaction = db.transaction(VIDEOS_CACHE_STORE, 'readwrite');
  const store = transaction.objectStore(VIDEOS_CACHE_STORE);
  const index = store.index('channelId');
  const request = index.openCursor(IDBKeyRange.only(channelId));

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete videos for channel: ${request.error?.message}`));
    };
  });
}

/**
 * Clear all cached videos
 */
export async function clearAllCachedVideos(): Promise<void> {
  await executeTransaction(
    VIDEOS_CACHE_STORE,
    'readwrite',
    (store) => store.clear()
  );
}

/**
 * Remove cached videos older than the specified age (in milliseconds)
 * Useful for cleaning up stale cache data
 */
export async function removeOldCachedVideos(maxAge: number): Promise<number> {
  const cutoffTime = Date.now() - maxAge;
  const db = await getDB();
  const transaction = db.transaction(VIDEOS_CACHE_STORE, 'readwrite');
  const store = transaction.objectStore(VIDEOS_CACHE_STORE);
  const index = store.index('cachedAt');
  const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete old videos: ${request.error?.message}`));
    };
  });
}

/**
 * Get the count of cached videos
 */
export async function getCachedVideoCount(): Promise<number> {
  return executeTransaction(
    VIDEOS_CACHE_STORE,
    'readonly',
    (store) => store.count()
  );
}

// ========================================
// Utility Functions
// ========================================

/**
 * Check if a subscription exists
 */
export async function hasSubscription(channelId: string): Promise<boolean> {
  const subscription = await getSubscription(channelId);
  return subscription !== undefined;
}

/**
 * Clear all data from the database (both subscriptions and cache)
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    clearAllSubscriptions(),
    clearAllCachedVideos()
  ]);
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  subscriptionCount: number;
  cachedVideoCount: number;
}> {
  const [subscriptionCount, cachedVideoCount] = await Promise.all([
    getSubscriptionCount(),
    getCachedVideoCount()
  ]);

  return {
    subscriptionCount,
    cachedVideoCount
  };
}

/**
 * Check if IndexedDB is supported and available
 */
export function isIndexedDBSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Delete the entire database (use with caution)
 */
export async function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete database: ${request.error?.message}`));
    };

    request.onblocked = () => {
      reject(new Error('Database deletion blocked - close all tabs using this database'));
    };
  });
}

/**
 * Replace a subscription with a new one (handles ID changes)
 * Deletes the old subscription and adds the new one in a transaction
 */
export async function replaceSubscription(oldId: string, newSubscription: StoredSubscription): Promise<void> {
  const db = await getDB();
  const transaction = db.transaction(SUBSCRIPTIONS_STORE, 'readwrite');
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
      reject(new Error(`Replace subscription failed: ${transaction.error?.message}`));
    };
  });
}
