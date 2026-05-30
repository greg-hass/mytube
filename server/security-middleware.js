const DEFAULT_WRITE_WINDOW_MS = 60 * 1000;
const DEFAULT_WRITE_LIMIT = 30;
const MAX_SUBSCRIPTIONS = 5000;
const MAX_WATCHED_VIDEOS = 50000;
const MAX_REDIRECTS = 10000;
const MAX_STRING_LENGTH = 2048;
const MAX_API_KEY_LENGTH = 256;
const CHANNEL_ID_PATTERN = /^(UC[a-zA-Z0-9_-]{22}|handle_[a-zA-Z0-9_.@-]{1,128}|custom_[a-zA-Z0-9_./@-]{1,160})$/;
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{6,32}$/;

function parseAllowedOrigins(value) {
    if (Array.isArray(value)) {
        return value.map(String).map(origin => origin.trim()).filter(Boolean);
    }

    return String(value || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
}

function createCorsOptions({ allowedOrigins = [] } = {}) {
    const origins = new Set(parseAllowedOrigins(allowedOrigins));

    return {
        origin(origin, callback) {
            if (!origin || origins.size === 0 || origins.has(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error('Origin not allowed'));
        },
    };
}

function createOriginGuardMiddleware({ allowedOrigins = [] } = {}) {
    const origins = new Set(parseAllowedOrigins(allowedOrigins));

    return function originGuard(req, res, next) {
        if (origins.size === 0) {
            next();
            return;
        }

        const origin = req.header('origin');
        if (!origin || origins.has(origin)) {
            next();
            return;
        }

        res.status(403).json({ error: 'Origin not allowed' });
    };
}

function getBearerToken(req) {
    const authorization = req.header('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

function createApiKeyAuthMiddleware({ token = '', allowInsecureUnauthenticatedApi = false } = {}) {
    const configuredToken = String(token || '').trim();

    return function apiKeyAuth(req, res, next) {
        const isPublicGet = req.method === 'GET'
            && (req.path === '/healthz' || req.path === '/channel-thumbnail');
        if (isPublicGet) {
            next();
            return;
        }

        if (!configuredToken) {
            if (allowInsecureUnauthenticatedApi) {
                next();
                return;
            }

            res.status(503).json({ error: 'Server API token is not configured' });
            return;
        }

        if (getBearerToken(req) === configuredToken) {
            next();
            return;
        }

        res.status(401).json({ error: 'Unauthorized' });
    };
}

function getClientKey(req) {
    return req.ip
        || req.socket?.remoteAddress
        || 'unknown';
}

const { startBucketCleanup } = require('./utils');

function createBucketRateLimiter({ windowMs = DEFAULT_WRITE_WINDOW_MS, max = DEFAULT_WRITE_LIMIT } = {}) {
    const buckets = new Map();
    startBucketCleanup(buckets);

    function checkLimit(key) {
        const now = Date.now();
        const existing = buckets.get(key);
        const bucket = existing && existing.resetAt > now
            ? existing
            : { count: 0, resetAt: now + windowMs };

        bucket.count += 1;
        buckets.set(key, bucket);
        return bucket.count <= max;
    }

    function getBucket(key) {
        return buckets.get(key);
    }

    return { checkLimit, getBucket, buckets };
}

function createRateLimitMiddleware(opts) {
    const { checkLimit, getBucket } = createBucketRateLimiter(opts);
    const { windowMs = DEFAULT_WRITE_WINDOW_MS, max = DEFAULT_WRITE_LIMIT } = opts || {};

    return function rateLimit(req, res, next) {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            next();
            return;
        }

        const key = getClientKey(req);
        const allowed = checkLimit(key);
        const bucket = getBucket(key);

        res.setHeader?.('X-RateLimit-Limit', String(max));
        res.setHeader?.('X-RateLimit-Remaining', String(Math.max(0, max - (bucket?.count || 0))));
        res.setHeader?.('X-RateLimit-Reset', bucket ? new Date(bucket.resetAt).toISOString() : '');

        if (!allowed) {
            res.status(429).json({ error: 'Too many requests' });
            return;
        }

        next();
    };
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isReasonableString(value, { required = false, max = MAX_STRING_LENGTH } = {}) {
    if (value === undefined || value === null) return !required;
    return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
}

function validateSubscription(subscription, index) {
    if (!isPlainObject(subscription)) return `subscriptions[${index}] must be an object`;
    if (!isReasonableString(subscription.id, { required: true, max: 192 }) || !CHANNEL_ID_PATTERN.test(subscription.id)) {
        return `subscription ${index} has an invalid id`;
    }
    if (!isReasonableString(subscription.title, { required: true })) {
        return `subscription ${index} has an invalid title`;
    }

    for (const field of ['thumbnail', 'customUrl', 'description', 'group']) {
        if (!isReasonableString(subscription[field])) {
            return `subscription ${index} has an invalid ${field}`;
        }
    }

    for (const field of ['isFavorite', 'isMuted']) {
        if (subscription[field] !== undefined && typeof subscription[field] !== 'boolean') {
            return `subscription ${index} has an invalid ${field}`;
        }
    }

    if (subscription.addedAt !== undefined && !Number.isFinite(Number(subscription.addedAt))) {
        return `subscription ${index} has an invalid addedAt`;
    }

    return null;
}

function validateSettings(settings) {
    if (settings === undefined) return null;
    if (!isPlainObject(settings)) return 'settings must be an object';

    const stringFields = ['searchQuery', 'sortBy'];
    for (const field of stringFields) {
        if (!isReasonableString(settings[field], { max: 512 })) {
            return `settings.${field} is invalid`;
        }
    }

    if (!isReasonableString(settings.apiKey, { max: MAX_API_KEY_LENGTH })) {
        return 'settings.apiKey is invalid';
    }

    if (settings.quotaUsed !== undefined && !Number.isFinite(Number(settings.quotaUsed))) {
        return 'settings.quotaUsed is invalid';
    }

    if (settings.apiExhausted !== undefined && typeof settings.apiExhausted !== 'boolean') {
        return 'settings.apiExhausted is invalid';
    }

    return null;
}

function validateSyncPayload(data) {
    if (!isPlainObject(data)) return { valid: false, error: 'Invalid data format' };

    if (!Array.isArray(data.subscriptions)) return { valid: false, error: 'subscriptions must be an array' };
    if (data.subscriptions.length > MAX_SUBSCRIPTIONS) {
        return { valid: false, error: `subscriptions must contain ${MAX_SUBSCRIPTIONS} or fewer items` };
    }

    for (let index = 0; index < data.subscriptions.length; index += 1) {
        const error = validateSubscription(data.subscriptions[index], index);
        if (error) return { valid: false, error };
    }

    if (!Array.isArray(data.watchedVideos)) return { valid: false, error: 'watchedVideos must be an array' };
    if (data.watchedVideos.length > MAX_WATCHED_VIDEOS) {
        return { valid: false, error: `watchedVideos must contain ${MAX_WATCHED_VIDEOS} or fewer items` };
    }
    if (data.watchedVideos.some(videoId => typeof videoId !== 'string' || !VIDEO_ID_PATTERN.test(videoId))) {
        return { valid: false, error: 'watchedVideos contains an invalid video id' };
    }

    if (data.redirects !== undefined) {
        if (!isPlainObject(data.redirects)) return { valid: false, error: 'redirects must be an object' };
        const entries = Object.entries(data.redirects);
        if (entries.length > MAX_REDIRECTS) {
            return { valid: false, error: `redirects must contain ${MAX_REDIRECTS} or fewer items` };
        }

        for (const [sourceId, targetId] of entries) {
            if (!CHANNEL_ID_PATTERN.test(sourceId) || !CHANNEL_ID_PATTERN.test(String(targetId))) {
                return { valid: false, error: 'redirects contains an invalid channel id' };
            }
        }
    }

    const settingsError = validateSettings(data.settings);
    if (settingsError) return { valid: false, error: settingsError };

    return { valid: true };
}

module.exports = {
    createApiKeyAuthMiddleware,
    createBucketRateLimiter,
    createCorsOptions,
    createOriginGuardMiddleware,
    createRateLimitMiddleware,
    parseAllowedOrigins,
    validateSyncPayload,
};
