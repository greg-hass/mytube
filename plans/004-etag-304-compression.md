# Plan 004: Wire client ETag 304 + add response compression for /api/videos

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- src/hooks/useRSSVideos.ts server/app-factory.js server/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

The client polls `/api/videos` every 5 seconds during aggregation and every
15 seconds otherwise. Each poll downloads the **entire** video archive
(capped at 5000 videos, ~1–3 MB with description fields). The server
already computes an ETag and supports 304 Not Modified — but the client
never sends `If-None-Match`, so the 304 branch is dead code and the full
payload ships every time. Additionally, there is no compression middleware,
so the multi-MB JSON goes uncompressed over the wire. Wiring the ETag +
adding compression eliminates ~99% of poll bandwidth when nothing changed.

## Current state

**Server side** — `server/app-factory.js:405–430`:

```js
app.get("/api/videos", asyncHandler(async (req, res) => {
    // ... reads videoCache ...
    const normalized = normalizeVideoCacheThumbnails(data);
    const etag = `"${normalized.lastUpdated || "empty"}"`;
    if (req.header("if-none-match") === etag) {
        return res.status(304).end();    // ← THIS NEVER FIRES
    }
    res.setHeader("ETag", etag);
    res.json(normalized);
}));
```

The server is ready. The header check is case-insensitive via Express.

**Client side** — `src/hooks/useRSSVideos.ts:138–145`:

```js
const { data: serverData, ... } = useQuery({
    queryKey: ["server-videos"],
    queryFn: async () => {
        const response = await fetch("/api/videos");
        // ← NO If-None-Match header, NO ETag storage
        if (!response.ok) {
            throw new Error("Failed to fetch videos from server");
        }
        return response.json();
    },
    // refetchInterval: 2000 while aggregating, 15000 otherwise
});
```

**No compression** — `server/app-factory.js:215–231` middleware stack:

```js
app.use(cors(createCorsOptions({ allowedOrigins })));
app.use(createOriginGuardMiddleware({ allowedOrigins }));
app.use(createApiKeyAuthMiddleware(...));
app.use(createRateLimitMiddleware(...));
app.use(express.json({ limit: "5mb" }));
```

No `compression` middleware. Express doesn't gzip by default.

**Repo conventions**: server uses CommonJS (`require`), no TypeScript.
Frontend uses TypeScript, TanStack Query for data fetching.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Install   | `cd server && npm install compression` | adds dependency |
| Typecheck | `npm run type-check`                 | exit 0              |
| Lint      | `npm run lint`                       | exit 0              |
| Test      | `npm test -- --run`                  | all pass            |

## Scope

**In scope** (the only files you should modify):

- `src/hooks/useRSSVideos.ts` — store last ETag, send `If-None-Match`,
  handle 304 by returning cached data.
- `server/app-factory.js` — add `compression` middleware.
- `server/package.json` — add `compression` dependency.

**Out of scope** (do NOT touch):

- `/api/videos/status` — separate endpoint, already lightweight.
- `/api/videos/refresh` — POST endpoint, not a polling concern.
- The ETag computation logic on the server — it works, just unused.
- Pagination/cursor support — this is a future enhancement, not this plan.

## Git workflow

- Branch: `advisor/004-etag-compression`
- Commit message style: `perf: wire ETag 304 and add compression for /api/videos`
- Do NOT push or open a PR unless the operator instructed it.

## Suggested executor toolkit

- Use `ast_grep_search` to find the exact `queryFn` pattern in
  `useRSSVideos.ts` if the line numbers have drifted.

## Steps

### Step 1: Install compression middleware

```bash
cd server && npm install compression
```

**Verify**: `node -e "require('compression'); console.log('ok')"` → `ok`

### Step 2: Add compression to the Express app

In `server/app-factory.js`, add the require at the top (after `const cors
= require("cors")`, around line 2):

```js
const compression = require("compression");
```

Then add it as the **first** middleware (before CORS, around line 215):

```js
const app = express();
app.use(compression());                    // ← ADD THIS
app.use(cors(createCorsOptions({ allowedOrigins })));
```

Compression must be first so all responses are eligible.

**Verify**: `npm test -- --run` → existing tests pass (compression is
transparent to tests using supertest).

### Step 3: Wire the client to send If-None-Match and handle 304

In `src/hooks/useRSSVideos.ts`, modify the `["server-videos"]` queryFn.
The pattern: store the last ETag in a module-level variable, send it as
`If-None-Match`, and on 304 return the previously cached data.

Add a module-level ETag cache near the top of the file (after imports):

```typescript
let lastVideosETag: string | null = null;
let lastVideosData: VideoCacheData | null = null;
```

Then modify the queryFn (around line 140):

```typescript
queryFn: async () => {
    const headers: HeadersInit = {};
    if (lastVideosETag) {
        headers["If-None-Match"] = lastVideosETag;
    }
    const response = await fetch("/api/videos", { headers });
    if (response.status === 304 && lastVideosData) {
        return lastVideosData;
    }
    if (!response.ok) {
        throw new Error("Failed to fetch videos from server");
    }
    const etag = response.headers.get("etag");
    if (etag) {
        lastVideosETag = etag;
    }
    const data = await response.json();
    lastVideosData = data;
    return data;
},
```

**Important**: TanStack Query's `queryFn` must return data even on 304 —
that's why we cache `lastVideosData` and return it. The query still
"succeeds" (no error thrown), just with the same data.

**Type note**: If `VideoCacheData` isn't an existing type, use the return
type of the existing queryFn or `unknown`. Check the existing type
annotations in the file.

**Verify**: `npm run type-check` → no type errors.

### Step 4: Add a test for the ETag 304 behavior

Add a test (in `src/hooks/useRSSVideos.test.tsx` if it exists, or create
a focused test) that verifies:

1. First fetch sends no `If-None-Match` and stores the ETag.
2. Second fetch sends the stored `If-None-Match`.
3. When server returns 304, the query resolves with cached data (no error).

Mock `fetch` using `vi.fn()` or the existing test pattern.

**Verify**: `npm test -- --run useRSSVideos` → new test passes.

### Step 5: Run full test suite

```bash
npm test -- --run
```

**Verify**: all tests pass.

## Test plan

- New test: ETag 304 handling in `useRSSVideos` — verify header is sent and
  304 returns cached data.
- Existing tests must still pass — compression is transparent.
- Manual verification (document, don't automate): open the app, observe
  Network tab — second poll should return 304 with ~0 bytes body.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep 'compression' server/app-factory.js` matches (middleware added)
- [ ] `grep 'If-None-Match' src/hooks/useRSSVideos.ts` matches (client sends it)
- [ ] `grep 'compression' server/package.json` matches (dependency declared)
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test -- --run` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `useRSSVideos` queryFn structure doesn't match the excerpt (codebase
  has drifted).
- TanStack Query's `queryFn` can't return cached data on 304 without
  throwing (report the framework constraint).
- The `compression` package fails to install or has a peer dependency
  conflict — report the error.

## Maintenance notes

- The module-level ETag cache (`lastVideosETag`/`lastVideosData`) resets on
  page reload — that's fine, the first fetch after reload will be a full
  GET.
- If pagination is added later (`since`/`limit` on `/api/videos`), the ETag
  must include those params or be scoped per-window.
- Compression applies to ALL Express responses, not just `/api/videos` —
  this is correct and desirable (sync responses benefit too).
- The ETag is based on `lastUpdated` timestamp from the video cache, which
  changes every aggregation cycle. During active aggregation (5s polls),
  the ETag will change frequently — the 304 win is biggest during idle
  periods (15s polls with no refresh).
