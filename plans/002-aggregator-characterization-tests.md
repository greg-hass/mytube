# Plan 002: Characterization tests for feed-aggregator orchestrator

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- server/feed-aggregator.js server/feed-aggregator-internals.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

`server/feed-aggregator.js` is the highest-churn file in the repo (60
commits), the feature the app exists for, and the core path for the
in-progress Feedy refactor. It has **zero tests** for its main orchestration
functions (`runAggregation`, `aggregateFeeds`, `aggregateOnStartupIfStale`).
The existing `feed-aggregator-internals.test.js` is 58 lines testing only
`refreshBatch` metadata and `setRunningAggregationStatus`. This plan adds
characterization tests that lock in current behavior so that plan 003 (fix
the aggregation write clobber) and the Feedy refactor can proceed safely.

## Current state

- `server/feed-aggregator.js` — 741 LOC. The `__test__` export object
  (lines 735–741) currently exposes only:

  ```js
  __test__: {
      getActiveChannels: aggregator.getActiveChannels,
      refreshBatch: aggregator.refreshBatch,
      setRunningAggregationStatus: aggregator.setRunningAggregationStatus,
      getAggregationStatus: aggregator.getAggregationStatus,
  },
  ```

  **`runAggregation` and `aggregateFeeds` are NOT exported** — they're
  unreachable from tests by design.

- `server/feed-aggregator-internals.test.js` — 58 LOC, 2 tests only.

- The `createFeedAggregator` factory (around line 200) takes `{ appStore,
  feedFetcher, ... }` as a deps object — this is already structured for
  dependency injection.

- The main aggregation flow (`runAggregation`, lines ~254–460):
  1. Reads `parsedData` from `appStore.readData(DEFAULT_DATA)`
  2. Reads existing video cache from `appStore.readVideoCache`
  3. Processes subscriptions in batches with bounded concurrency
  4. Merges redirects, resolves channels
  5. Writes results back via `appStore.writeData(parsedData)` (line ~448)
  6. Writes video cache via `appStore.writeVideoCache(...)`

- Test convention: server tests are plain `.test.js` files using Vitest
  (`describe`, `it`, `expect`, `vi`). See `server/feed-refresh-policy.test.js`
  (19 KB, 22 changes) as the exemplar for heavy coverage patterns.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Test      | `npm test -- --run`                  | all pass            |
| Test (filter) | `npm test -- --run --reporter=verbose feed-aggregator` | new tests pass |

## Scope

**In scope** (the only files you should modify):

- `server/feed-aggregator.js` — only to add `runAggregation` and
  `aggregateFeeds` to the `__test__` export object.
- `server/feed-aggregator-internals.test.js` — add characterization tests.

**Out of scope** (do NOT touch):

- `server/app-factory.js` — route wiring, not under test.
- `server/sqlite-store.js` — persistence layer, mock it.
- Any frontend files.
- Any logic changes to the aggregator itself — this is tests ONLY.

## Git workflow

- Branch: `advisor/002-aggregator-tests`
- Commit message style: `test: add characterization tests for feed-aggregator orchestrator`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Export `runAggregation` and `aggregateFeeds` under `__test__`

In `server/feed-aggregator.js`, add to the `__test__` object (around line
735):

```js
__test__: {
    getActiveChannels: aggregator.getActiveChannels,
    refreshBatch: aggregator.refreshBatch,
    setRunningAggregationStatus: aggregator.setRunningAggregationStatus,
    getAggregationStatus: aggregator.getAggregationStatus,
    runAggregation: aggregator.runAggregation,
    aggregateFeeds: aggregator.aggregateFeeds,
    aggregateOnStartupIfStale: aggregator.aggregateOnStartupIfStale,
},
```

**Verify**: `node -e "const m = require('./server/feed-aggregator'); console.log(typeof m.__test__.runAggregation)"` → `function`

### Step 2: Create mock appStore and feedFetcher

In the test file, create mock objects that satisfy the interface
`createFeedAggregator` expects. Pattern:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

function createMockAppStore(overrides = {}) {
    let data = overrides.data || { subscriptions: [], settings: {}, redirects: {} };
    let videoCache = overrides.videoCache || { videos: [], lastUpdated: null };
    return {
        readData: vi.fn(async () => JSON.parse(JSON.stringify(data))),
        writeData: vi.fn(async (d) => { data = d; return d; }),
        updateData: vi.fn(async (fallback, updater) => {
            const current = JSON.parse(JSON.stringify(data));
            const updated = await updater(current);
            data = updated || current;
            return data;
        }),
        readVideoCache: vi.fn(async () => JSON.parse(JSON.stringify(videoCache))),
        writeVideoCache: vi.fn(async (c) => { videoCache = c; return c; }),
        getCurrentRevision: vi.fn(() => 1),
        ...overrides,
    };
}

function createMockFeedFetcher(feeds = {}) {
    return {
        fetchChannelFeed: vi.fn(async (channel) => feeds[channel.id] || { items: [] }),
    };
}
```

### Step 3: Write characterization tests

Write tests covering these behaviors (use `describe` blocks):

1. **Stale cache skip**: when the video cache is fresh (not stale),
   `aggregateOnStartupIfStale` should NOT trigger a full aggregation.
2. **Empty subscriptions**: `runAggregation` with zero subscriptions
   completes without error and writes an empty video cache.
3. **Basic aggregation**: with 2 mock subscriptions, `runAggregation`
   fetches feeds for both, produces videos, and writes them to the cache.
4. **Partial failure**: when `fetchChannelFeed` throws for one channel
   out of three, aggregation completes for the other two and does not
   crash — the failed channel is recorded in refresh state.
5. **Subscription metadata preservation**: after aggregation, the written
   data preserves `redirects` that existed before the run.
6. **Bounded concurrency**: `runAggregation` processes channels in batches
   (not all at once) — verify by checking the mock `fetchChannelFeed` call
   timing or batch count.

For each test, assert on the mock calls (`expect(appStore.writeData).toHaveBeenCalled()`,
`expect(appStore.writeVideoCache).toHaveBeenCalledWith(expect.objectContaining(...))`).

**Verify**: `npm test -- --run --reporter=verbose feed-aggregator` → all
old + new tests pass.

### Step 4: Run full test suite

```bash
npm test -- --run
```

**Verify**: all tests pass (existing 491 + new tests).

## Test plan

The tests ARE the deliverable. Ensure:

- At least 5 test cases covering the behaviors above.
- Each test uses fresh mocks (use `beforeEach` to reset).
- Tests are deterministic — no real network, no real timers (use
  `vi.useFakeTimers()` if timing matters).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `server/feed-aggregator.js` exports `runAggregation`, `aggregateFeeds`, `aggregateOnStartupIfStale` under `__test__`
- [ ] `npm test -- --run` exits 0 with at least 5 new tests in `feed-aggregator-internals.test.js`
- [ ] No logic changes to aggregator functions themselves (diff the non-export lines)
- [ ] `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `createFeedAggregator` factory signature doesn't match the excerpt
  (the codebase has drifted).
- `runAggregation` has side effects that can't be isolated with mocks
  (e.g., it directly calls `console.log` or accesses global state that
  can't be controlled) — report what you found.
- A mock interface mismatch prevents the tests from running — report the
  actual interface vs what was expected.

## Maintenance notes

- These tests are **characterization tests** — they lock in current
  behavior, including the write-clobber bug (plan 003). When plan 003
  fixes the write path, some of these tests will need updating to reflect
  the corrected merge semantics.
- The Feedy refactor spec (`docs/superpowers/specs/2026-07-03-feedy-youtube-refresh-discovery-design.md`)
  lists 6 required aggregation test behaviors — align test names with
  those where possible.
