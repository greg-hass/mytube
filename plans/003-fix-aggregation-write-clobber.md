# Plan 003: Fix feed-aggregation write clobber of concurrent mutations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- server/feed-aggregator.js server/sqlite-store.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-aggregator-characterization-tests.md` (tests
  must exist to verify this fix doesn't regress)
- **Category**: bug
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

Feed aggregation (scheduled every 5 min + on startup + fire-and-forget after
sync/delete) holds a stale snapshot for its entire multi-minute run, then
blindly overwrites the database with it via `appStore.writeData()`. During
that window: deleting a channel resurrects it and wipes its tombstone;
adding a channel mid-run silently drops it; watched-state and settings
changes are lost. This is a data-integrity bug on the app's core feature.

## Current state

**The problem path** — `server/feed-aggregator.js`:

```js
// Line ~254: reads snapshot ONCE at start
const parsedData = await appStore.readData(DEFAULT_DATA);
const subscriptions = parsedData.subscriptions || [];

// ... minutes of feed fetching, channel resolution, processing ...

// Line ~448: writes the STALE snapshot back wholesale
parsedData.subscriptions = subscriptions;
if (!parsedData.redirects) { parsedData.redirects = {}; }
await appStore.writeData(parsedData);
```

**Why it clobbers** — `server/sqlite-store.js`:

- `writeData(data)` (line ~190) calls `writeDataSnapshot(data)` with
  `previousSubscriptions = null`, which means:
  - Computes `removedIds` by diffing **current DB rows** against the stale
    snapshot's IDs → any channel added during the run is in DB but not in
    the snapshot → gets **deleted** (line ~199–205).
  - `upsertSubscriptions` (line ~131) calls `clearTombstone.run(id)` for
    every subscription → a channel deleted during the run gets
    **resurrected** and its tombstone wiped (line ~145).
  - `writeAppState("watched_videos", ...)` and `writeAppState("settings",
    ...)` overwrite any concurrent changes (line ~233, ~230).

**The safe alternative already exists** — `updateData(fallback, updater, opts)`:

```js
// sqlite-store.js — already in the codebase:
async updateData(fallback, updater, options = {}) {
    const current = getDataSnapshot(fallback);   // RE-READS current state
    const updated = await updater(current);       // merge function
    const nextData = updated === undefined ? current : updated;
    writeDataSnapshot(nextData, {
        previousSubscriptions: current.subscriptions,  // tracks adds
        ...options,
    });
    return getDataSnapshot(fallback);
}
```

The `app-factory.js` sync/delete handlers already use `updateData` — only
the aggregator uses the dangerous `writeData` path.

**Repo conventions**: error handling follows async/await with try/catch.
The `asyncHandler` wrapper in `app-factory.js` catches route errors.
SQLite writes are synchronous (better-sqlite3 is sync).

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Test      | `npm test -- --run`                  | all pass            |
| Test (filter) | `npm test -- --run feed-aggregator` | pass incl. concurrent-mutation test |
| Lint      | `npm run lint`                       | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `server/feed-aggregator.js` — change the final save from `writeData` to
  `updateData` with a merge function.
- `server/feed-aggregator-internals.test.js` — add a test for concurrent
  mutation safety.

**Out of scope** (do NOT touch):

- `server/sqlite-store.js` — the `updateData` method already exists and
  works correctly. Do NOT modify the store.
- `server/app-factory.js` — route handlers already use `updateData`.
- The video cache write path (`writeVideoCache`) — this has a separate
  concern and is lower risk (video cache has no user mutations).

## Git workflow

- Branch: `advisor/003-fix-aggregation-write-clobber`
- Commit message style: `fix: prevent feed aggregation from clobbering concurrent mutations`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace `writeData` with `updateData` in the final save

In `server/feed-aggregator.js`, around line 448, replace:

```js
// BEFORE — stale snapshot blind overwrite:
parsedData.subscriptions = subscriptions;
if (!parsedData.redirects) {
    parsedData.redirects = {};
}
await appStore.writeData(parsedData);
```

With a merge that re-reads current state and preserves concurrent changes:

```js
// AFTER — merge aggregator results with current DB state:
await appStore.updateData(
    DEFAULT_DATA,
    (current) => {
        // Build a map of aggregator's updated subscriptions for fast lookup.
        // Only update metadata (title, thumbnail, etc.) for subscriptions
        // that still exist in the current DB. Don't resurrect deleted ones
        // (they won't be in current.subscriptions). Don't drop added ones
        // (they're in current but not in the aggregator's snapshot).
        const aggregatorMeta = new Map(
            subscriptions.map((s) => [s.id, s]),
        );
        const mergedSubs = (current.subscriptions || []).map((sub) => {
            const updated = aggregatorMeta.get(sub.id);
            return updated || sub;
        });

        return {
            ...current,
            subscriptions: mergedSubs,
            redirects: {
                ...(current.redirects || {}),
                ...(parsedData.redirects || {}),
            },
            // Preserve current watched videos and settings — aggregator
            // must NOT overwrite concurrent user state changes.
            settings: {
                ...current.settings,
                // Only update quota tracking (aggregator-specific):
                quotaUsed: parsedData.settings?.quotaUsed,
                lastQuotaResetDate: parsedData.settings?.lastQuotaResetDate,
            },
        };
    },
);
```

**Key principle**: the merge function receives `current` (freshly read from
DB) and returns the merged result. `updateData` then writes it with
`previousSubscriptions: current.subscriptions`, so channels added during the
run are preserved, and tombstoned channels stay tombstoned.

**Verify**: `npm test -- --run feed-aggregator` → existing tests still pass
(plan 002's characterization tests may need updating if they assert on
`writeData` calls — update them to assert on `updateData` instead).

### Step 2: Add a concurrent-mutation test

In `server/feed-aggregator-internals.test.js`, add a test that simulates
the race condition:

```js
it("does not clobber subscriptions added during aggregation", async () => {
    const { __test__ } = require("./feed-aggregator");

    // Setup: mock appStore where readData returns one subscription,
    // but updateData's re-read returns TWO (simulating a concurrent add).
    const initialData = {
        subscriptions: [{ id: "UC001", title: "Channel A" }],
        settings: {},
        redirects: {},
    };
    const concurrentAdd = {
        subscriptions: [
            { id: "UC001", title: "Channel A" },
            { id: "UC002", title: "Channel B" }, // added during run
        ],
        settings: {},
        redirects: {},
    };

    let readCallCount = 0;
    const mockAppStore = {
        readData: vi.fn(async () => {
            readCallCount++;
            return JSON.parse(JSON.stringify(initialData));
        }),
        updateData: vi.fn(async (fallback, updater) => {
            // Simulate: updater receives the CURRENT state (with the add)
            const current = JSON.parse(JSON.stringify(concurrentAdd));
            const result = await updater(current);
            return result;
        }),
        writeData: vi.fn(async (d) => d), // should NOT be called
        readVideoCache: vi.fn(async () => ({ videos: [] })),
        writeVideoCache: vi.fn(async (c) => c),
        getCurrentRevision: vi.fn(() => 1),
    };

    const mockFeedFetcher = {
        fetchChannelFeed: vi.fn(async () => ({ items: [] })),
    };

    // Create aggregator and run
    const aggregator = createFeedAggregator({ appStore: mockAppStore, feedFetcher: mockFeedFetcher });
    await aggregator.runAggregation();

    // The merge should preserve UC002 (the concurrent add)
    const updateCall = mockAppStore.updateData.mock.calls[0];
    const mergeResult = await updateCall[1](concurrentAdd);
    expect(mergeResult.subscriptions).toHaveLength(2);
    expect(mergeResult.subscriptions.find(s => s.id === "UC002")).toBeDefined();

    // writeData should NOT have been called
    expect(mockAppStore.writeData).not.toHaveBeenCalled();
});
```

**Verify**: `npm test -- --run feed-aggregator` → all tests pass including
the new concurrent-mutation test.

### Step 3: Run full test suite

```bash
npm test -- --run
```

**Verify**: all tests pass.

## Test plan

- New test: "does not clobber subscriptions added during aggregation" —
  verifies the merge preserves concurrent adds.
- New test (optional): "does not resurrect deleted subscriptions" — verifies
  tombstoned channels aren't re-added.
- Update characterization tests from plan 002 if they assert on `writeData`
  calls → change to `updateData`.
- All existing tests must still pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n 'appStore.writeData(parsedData)' server/feed-aggregator.js` returns NO matches (the blind overwrite is gone)
- [ ] `grep -n 'appStore.updateData' server/feed-aggregator.js` returns matches (the merge path is in place)
- [ ] `npm test -- --run` exits 0, including a test asserting concurrent adds are preserved
- [ ] `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `updateData` method signature doesn't match the excerpt (codebase has
  drifted).
- The merge function can't access the data it needs (e.g., `parsedData.redirects`
  or `parsedData.settings.quotaUsed` aren't populated at the write point).
- A characterization test from plan 002 fails in a way that suggests the
  aggregator's behavior has broader side effects than expected — report
  what you found.

## Maintenance notes

- The merge function deliberately does NOT propagate aggregator-computed
  `watchedVideos` — the aggregator never modifies watched state, so this
  is correct.
- If the aggregator ever needs to write settings beyond quota tracking
  (e.g., `lastRefreshDate`), add those specific keys to the settings merge
  instead of overwriting the whole settings object.
- The video cache write (`writeVideoCache`) is a separate concern — it
  doesn't have user mutations competing with it, so it's left as-is. If
  that changes, apply the same merge pattern.
- Reviewer should verify: the merge preserves aggregator's subscription
  metadata updates (title, thumbnail from RSS) while not dropping adds or
  resurrecting deletes.
