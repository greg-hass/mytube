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

module.exports = {
    startBucketCleanup,
};
