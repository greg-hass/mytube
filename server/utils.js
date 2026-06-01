function startBucketCleanup(buckets, intervalMs = 60000) {
    const timer = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now) {
                buckets.delete(key);
            }
        }
    }, intervalMs);
    timer.unref?.();
    return timer;
}

function createLruCache({ maxEntries, onEvict } = {}) {
    if (!Number.isFinite(maxEntries) || maxEntries <= 0) {
        throw new Error('createLruCache requires a positive maxEntries');
    }
    const entries = new Map();

    function touch(key, value) {
        if (entries.has(key)) {
            entries.delete(key);
        }
        entries.set(key, value);
        while (entries.size > maxEntries) {
            const oldestKey = entries.keys().next().value;
            entries.delete(oldestKey);
            if (onEvict) onEvict(oldestKey);
        }
    }

    return {
        get size() {
            return entries.size;
        },
        get maxEntries() {
            return maxEntries;
        },
        get(key) {
            if (!entries.has(key)) return undefined;
            const value = entries.get(key);
            entries.delete(key);
            entries.set(key, value);
            return value;
        },
        has(key) {
            return entries.has(key);
        },
        set(key, value) {
            touch(key, value);
            return entries;
        },
        delete(key) {
            return entries.delete(key);
        },
        clear() {
            entries.clear();
        },
        entries() {
            return entries.entries();
        },
    };
}

module.exports = {
    createLruCache,
    startBucketCleanup,
};
