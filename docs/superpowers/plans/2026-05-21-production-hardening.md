# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the highest production risks found in the audit by hardening the API boundary, dependency posture, CI gates, container defaults, and persistence path.

**Architecture:** Start by making the existing Express server safe for trusted self-hosted deployments: auth, CORS, request validation, rate limiting, and safer upstream fetch controls. Then add release gates and container hardening before larger persistence changes. SQLite migration is intentionally later because it is higher blast radius than front-door security.

**Tech Stack:** Express 4, React/Vite, Vitest, Docker/nginx, GitHub Actions, npm audit, future SQLite migration.

---

### Task 1: API Request Guardrails

**Files:**
- Create: `server/security-middleware.js`
- Create: `server/security-middleware.test.js`
- Create: `src/lib/api-auth.ts`
- Create: `src/lib/api-auth.test.ts`
- Modify: `server/index.js`
- Modify: `src/main.tsx`
- Modify: `src/components/SettingsModal.tsx`
- Modify: `README.md`
- Modify: `.env.example`

- [x] **Step 1: Write failing tests for auth, CORS decisions, body validation, and rate limiting**

```js
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    createApiKeyAuthMiddleware,
    createOriginGuardMiddleware,
    createRateLimitMiddleware,
    validateSyncPayload,
} = require('./security-middleware');

describe('security middleware', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-21T12:00:00Z'));
    });

    it('allows requests when no server API token is configured', () => {
        const middleware = createApiKeyAuthMiddleware({ token: '' });
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
    });

    it('rejects oversized or malformed sync payloads', () => {
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
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- --run server/security-middleware.test.js`
Expected: FAIL with module not found for `./security-middleware`.

- [x] **Step 3: Implement minimal middleware and validators**

Implement `server/security-middleware.js` with:
- bearer token check driven by `SERVER_API_TOKEN`
- origin allowlist driven by `ALLOWED_ORIGINS`
- simple in-memory write rate limiter
- sync payload validation for array sizes, object shape, channel IDs, watched video IDs, redirects, and settings

- [x] **Step 4: Wire middleware into Express**

Modify `server/index.js` so request controls run before routes:
- configure CORS with explicit allowlist
- apply origin guard
- apply bearer auth to `/api/*` when token is configured
- apply mutating request rate limits
- use `validateSyncPayload` before writing `/api/sync`

- [x] **Step 5: Add frontend token forwarding**

Add a tested `installAuthenticatedFetch()` helper that reads the browser-stored server API token and adds `Authorization: Bearer <token>` to same-origin `/api/*` fetches. Install it in `src/main.tsx` and add a Settings field for saving the token in this browser.

- [x] **Step 6: Update setup docs**

Document `SERVER_API_TOKEN`, `ALLOWED_ORIGINS`, `API_WRITE_RATE_LIMIT_WINDOW_MS`, and `API_WRITE_RATE_LIMIT_MAX`.

- [x] **Step 7: Run focused and full verification**

Run:
```bash
npm test -- --run server/security-middleware.test.js
npm test -- --run src/lib/api-auth.test.ts
npm test -- --run
npm run type-check
```

Expected: all pass.

### Task 2: Dependency Remediation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`

- [x] **Step 1: Run current audit**

Run:
```bash
npm audit --omit=dev
cd server && npm audit --omit=dev
```

Expected before fixes: critical/high advisories for `fast-xml-parser`, `react-router`, `axios`, `express`, and transitive packages.

- [x] **Step 2: Apply safe dependency updates**

Run:
```bash
npm audit fix
cd server && npm audit fix
```

- [x] **Step 3: Verify compatibility**

Run:
```bash
npm test -- --run
npm run build
npm run type-check
cd server && npm audit --omit=dev
cd .. && npm audit --omit=dev
```

Expected: tests/build/type-check pass and production audit is clean or explicitly documented if an upstream fix is unavailable.

### Task 3: CI Release Gates

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

- [x] **Step 1: Add failing expectation manually**

Confirm current workflow has no test gate:
```bash
rg -n "npm run (type-check|lint|test|build)|npm audit" .github/workflows/docker-publish.yml
```

Expected: no output.

- [x] **Step 2: Add CI gates before image push**

Add steps:
```yaml
      - name: Install frontend dependencies
        run: npm ci

      - name: Type-check frontend
        run: npm run type-check

      - name: Test frontend and server
        run: npm test -- --run

      - name: Audit frontend production dependencies
        run: npm audit --omit=dev

      - name: Install server dependencies
        working-directory: server
        run: npm ci

      - name: Audit server production dependencies
        working-directory: server
        run: npm audit --omit=dev

      - name: Build frontend
        run: npm run build
```

- [x] **Step 3: Verify workflow syntax**

Run:
```bash
npm test -- --run vite.config.test.ts
```

Expected: PASS. If `actionlint` is installed locally, also run `actionlint`.

### Task 4: Container and nginx Hardening

**Files:**
- Modify: `Dockerfile`
- Modify: `nginx.conf`
- Modify: `docker-compose.yml`
- Modify: `DEPLOYMENT.md`
- Modify: `DOCKGE.md`

- [x] **Step 1: Add non-root runtime user**

Modify final Docker stage to create a system user, chown writable paths, and run as that user where nginx can still bind safely or use a high port behind Docker.

- [x] **Step 2: Add security headers**

Add conservative headers to `nginx.conf`:
```nginx
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://www.youtube.com https://*.googleusercontent.com https://i.ytimg.com https://*.ytimg.com https://*.googleapis.com https://pipedapi.kavin.rocks https://api.piped.ot.ax https://pipedapi.drgns.space https://inv.tux.pizza https://invidious.projectsegfau.lt https://yt.artemislena.eu;" always;
```

- [ ] **Step 3: Build and smoke-test image**

Run:
```bash
docker build -t youtube-subscriptions:hardening .
docker run --rm -p 5173:8080 -e SERVER_API_TOKEN=test-token youtube-subscriptions:hardening
```

Expected: app serves, `/api/sync` rejects without auth, accepts with bearer token.

### Task 5: Lint Cleanup

**Files:**
- Modify: `eslint.config.js`
- Modify: `src/components/ChannelViewer.tsx`
- Modify: `src/components/VideoPlayer.tsx`
- Modify: `src/components/VideoCard.tsx`
- Modify: `src/lib/indexeddb.ts`
- Modify: typed test mocks with `unknown` or concrete test types

- [x] **Step 1: Ignore generated folders**

Modify global ignores:
```ts
globalIgnores(['dist', '.vite', 'node_modules', 'coverage'])
```

- [x] **Step 2: Fix hook-order violations**

Move early returns below hook calls or replace imperative navigation with effects. Rename `useNextThumbnailFallback` in `VideoCard` to `applyNextThumbnailFallback`.

- [x] **Step 3: Fix async Promise executors**

Refactor `executeTransaction` and `executeCursor` in `src/lib/indexeddb.ts` to avoid `new Promise(async ...)`.

- [x] **Step 4: Run lint**

Run:
```bash
npm run lint
```

Expected: PASS.

### Task 6: SQLite Persistence Migration

**Files:**
- Create: `server/sqlite-store.js`
- Create: `server/migrations/001_initial.sql`
- Create: `server/sqlite-store.test.js`
- Modify: `server/index.js`
- Modify: `server/feed-aggregator.js`
- Modify: `README.md`

- [x] **Step 1: Add database schema**

Schema includes:
```sql
CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE subscriptions (id TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE videos (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, published_at TEXT, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_videos_channel_id ON videos(channel_id);
CREATE INDEX idx_videos_published_at ON videos(published_at);
CREATE TABLE channel_refreshes (channel_id TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
```

- [x] **Step 2: Write migration tests**

Test that JSON state imports into SQLite and that existing API response shapes remain unchanged.

- [x] **Step 3: Implement compatibility layer**

Keep `/api/sync` and `/api/videos` response shapes stable while moving storage underneath.

- [x] **Step 4: Run full tests and manual migration on copied data**

Run:
```bash
cp -R server/data /tmp/youtube-subscriptions-data-backup
npm test -- --run
```

Expected: API behavior remains compatible and old JSON files are not destroyed during migration.

### Task 7: SQLite Backup And Restore Drill

**Files:**
- Create: `server/sqlite-backup.js`
- Create: `server/sqlite-backup.test.js`
- Modify: `server/package.json`
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`
- Modify: `DOCKGE.md`

- [x] **Step 1: Add tested SQLite snapshot backup and restore helpers**

- [x] **Step 2: Expose backup/restore CLI scripts**

- [x] **Step 3: Document live backup and stop-before-restore operator steps**

- [x] **Step 4: Run copied-data drill restoring a temp database from backup**

Verify the restored copy has subscriptions and videos again, and that restore created a pre-restore recovery snapshot of the damaged copy.
