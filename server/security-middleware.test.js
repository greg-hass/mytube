import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    createApiKeyAuthMiddleware,
    createBucketRateLimiter,
    createCorsOptions,
    createOriginGuardMiddleware,
    createRateLimitMiddleware,
    describeAllowlist,
    validateSyncPayload,
} = require('./security-middleware');

describe('security middleware', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-21T12:00:00Z'));
    });

    it('rejects API requests when no server API token or insecure opt-out is configured', () => {
        const middleware = createApiKeyAuthMiddleware({ token: '' });
        const req = { path: '/api/sync', method: 'GET', header: () => undefined };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ error: 'Server API token is not configured' });
    });

    it('allows API requests without a token only when insecure unauthenticated mode is explicit', () => {
        const middleware = createApiKeyAuthMiddleware({ token: '', allowInsecureUnauthenticatedApi: true });
        const req = { path: '/api/sync', method: 'GET', header: () => undefined };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects protected API requests without the configured bearer token', () => {
        const middleware = createApiKeyAuthMiddleware({ token: 'secret-token' });
        const req = { path: '/api/sync', method: 'GET', header: () => undefined };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('accepts protected API requests with the configured bearer token', () => {
        const middleware = createApiKeyAuthMiddleware({ token: 'secret-token' });
        const req = {
            path: '/api/sync',
            method: 'GET',
            header: (name) => name.toLowerCase() === 'authorization' ? 'Bearer secret-token' : undefined,
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it('keeps the lightweight health probe public when auth is configured', () => {
        const middleware = createApiKeyAuthMiddleware({ token: 'secret-token' });
        const req = { path: '/healthz', method: 'GET', header: () => undefined };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('keeps allowlisted channel thumbnail image requests public for img elements', () => {
        const middleware = createApiKeyAuthMiddleware({ token: 'secret-token' });
        const req = { path: '/channel-thumbnail', method: 'GET', header: () => undefined };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects disallowed browser origins when allowed origins are configured', () => {
        const middleware = createOriginGuardMiddleware({ allowedOrigins: ['https://feeds.example.com'] });
        const req = {
            method: 'POST',
            header: (name) => name.toLowerCase() === 'origin' ? 'https://evil.example' : undefined,
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Origin not allowed' });
    });

    it('allows configured browser origins', () => {
        const middleware = createOriginGuardMiddleware({ allowedOrigins: ['https://feeds.example.com'] });
        const req = {
            method: 'POST',
            header: (name) => name.toLowerCase() === 'origin' ? 'https://feeds.example.com' : undefined,
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it('rejects public origins by default when no allowed origins are configured', () => {
        const middleware = createOriginGuardMiddleware({ allowedOrigins: [] });
        const req = {
            method: 'POST',
            header: (name) => name.toLowerCase() === 'origin' ? 'https://evil.example' : undefined,
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows loopback and private network origins by default', () => {
        const middleware = createOriginGuardMiddleware({ allowedOrigins: [] });
        const cases = [
            'http://localhost:5173',
            'http://127.0.0.1:8080',
            'http://192.168.1.50:5173',
            'http://10.0.0.5:5173',
            'http://172.20.10.4:5173',
            'http://my-mac.local:5173',
        ];

        for (const origin of cases) {
            const req = {
                method: 'POST',
                header: (name) => name.toLowerCase() === 'origin' ? origin : undefined,
            };
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
            const next = vi.fn();

            middleware(req, res, next);

            expect(next, `expected ${origin} to be allowed`).toHaveBeenCalledOnce();
        }
    });

    it('allows requests with no Origin header (non-browser clients)', () => {
        const middleware = createOriginGuardMiddleware({ allowedOrigins: [] });
        const req = { method: 'POST', header: () => undefined };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it('describeAllowlist summarizes the effective policy', () => {
        expect(describeAllowlist(new Set())).toMatch(/loopback/);
        expect(describeAllowlist(new Set(['https://a.example', 'https://b.example'])))
            .toBe('https://a.example, https://b.example');
    });

    it('createCorsOptions rejects public origins by default', () => {
        const opts = createCorsOptions({ allowedOrigins: [] });
        const callback = vi.fn();

        opts.origin('https://evil.example', callback);
        expect(callback).toHaveBeenCalledWith(null, false);

        callback.mockClear();
        opts.origin('http://localhost:5173', callback);
        expect(callback).toHaveBeenCalledWith(null, true);

        callback.mockClear();
        opts.origin(undefined, callback);
        expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('rejects oversized sync payloads', () => {
        const result = validateSyncPayload({
            subscriptions: Array.from({ length: 5001 }, (_, index) => ({
                id: `UC${String(index).padStart(22, '0')}`,
                title: 'Channel',
            })),
            settings: {},
            watchedVideos: [],
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain('subscriptions');
    });

    it('rejects malformed subscription records', () => {
        const result = validateSyncPayload({
            subscriptions: [{ id: '../not-a-channel', title: '' }],
            settings: {},
            watchedVideos: [],
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain('subscription');
    });

    it('rejects partial sync snapshots that could wipe persisted state', () => {
        const result = validateSyncPayload({
            settings: { searchQuery: 'linux' },
            watchedVideos: [],
        });

        expect(result).toEqual({ valid: false, error: 'subscriptions must be an array' });
    });

    it('accepts a normal sync payload', () => {
        const result = validateSyncPayload({
            subscriptions: [{ id: 'UC1234567890123456789012', title: 'Channel' }],
            settings: { searchQuery: 'linux', sortBy: 'name', apiKey: 'abc', quotaUsed: 5 },
            watchedVideos: ['abc123_-XYZ'],
            redirects: { handle_test: 'UC1234567890123456789012' },
        });

        expect(result).toEqual({ valid: true });
    });

    it('limits repeated mutating requests by client key', () => {
        const middleware = createRateLimitMiddleware({ windowMs: 60_000, max: 2 });
        const req = {
            method: 'POST',
            ip: '127.0.0.1',
            header: () => undefined,
        };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
        const next = vi.fn();

        middleware(req, res, next);
        middleware(req, res, next);
        middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith({ error: 'Too many requests' });
    });

    it('does not let direct clients rotate x-forwarded-for to evade write limits', () => {
        const middleware = createRateLimitMiddleware({ windowMs: 60_000, max: 1 });
        const req = (forwardedFor) => ({
            method: 'POST',
            ip: '127.0.0.1',
            header: (name) => name.toLowerCase() === 'x-forwarded-for' ? forwardedFor : undefined,
        });
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
        const next = vi.fn();

        middleware(req('203.0.113.1'), res, next);
        middleware(req('203.0.113.2'), res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(429);
    });
});

describe('bucket rate limiter', () => {
    it('caps the bucket map at the configured LRU size', () => {
        const limiter = createBucketRateLimiter({ windowMs: 60_000, max: 5, maxEntries: 3 });

        for (let i = 0; i < 5; i += 1) {
            limiter.checkLimit(`ip-${i}`);
        }

        expect(limiter.getBucketStats().size).toBe(3);
        expect(limiter.getBucketStats().maxEntries).toBe(3);
    });

    it('keeps recently used buckets when evicting the LRU', () => {
        const limiter = createBucketRateLimiter({ windowMs: 60_000, max: 5, maxEntries: 2 });

        limiter.checkLimit('a');
        limiter.checkLimit('b');
        limiter.checkLimit('a');
        limiter.checkLimit('c');

        expect(limiter.getBucket('a')).toBeDefined();
        expect(limiter.getBucket('b')).toBeUndefined();
        expect(limiter.getBucket('c')).toBeDefined();
    });
});
