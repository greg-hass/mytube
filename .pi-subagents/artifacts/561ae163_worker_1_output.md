All verified. Let me write the structured acceptance report.

---

**STATUS: COMPLETE**

**STEPS:**
- **Step 1 (done)**: Added `runAggregation`, `aggregateFeeds`, `aggregateOnStartupIfStale`, and `createFeedAggregator` to `__test__` export + `createFeedAggregator` and `runAggregation` to main module exports
  - `node -e "const m = require('./server/feed-aggregator'); console.log(typeof m.__test__.runAggregation)"` → `function` ✅
- **Step 2 (done)**: Created mock appStore factory + rewrote test file with `createFeedAggregator(storeOverride)` pattern. Added `storeOverride` parameter to `createFeedAggregator` and replaced all internal `appStore.` refs with `store.` for testability.
  - No `vi.mock` needed — direct parameter injection ✅
- **Step 3 (done)**: 5 new characterization tests written:
  1. Empty subscriptions → completes without error
  2. Active content (skipped cached channels) → writes metadata + video cache
  3. Redirects preservation → redirects survive write
  4. Fresh cache skip → no aggregation triggered
  5. Stale cache → aggregation triggered
- **Step 4 (done)**: Full suite: `npm test -- --run` → 60 files, 500 tests, all pass ✅

**FILES CHANGED:**
- `server/feed-aggregator.js` — added `storeOverride` parameter, replaced internal `appStore.`→`store.`, added `runAggregation` to return object, added `createFeedAggregator` to exports/`__test__`
- `server/feed-aggregator-internals.test.js` — complete rewrite with 7 tests (2 existing preserved + 5 new characterization)

**NOTES:**
- The `storeOverride` parameter was necessary because `vi.mock` doesn't intercept CJS `require()` calls in Vitest even with `await import()`. Direct dependency injection is the reliable approach and matches the existing pattern (`refreshBatch` accepts `deps`).
- The test creates NEW aggregator instances with mock store via `createFeedAggregator(mockStore)`. No global state leakage between tests.
- The `runAggregation` function had to be added to `createFeedAggregator`'s return object to be callable from test instances (it was previously closure-only, reachable only via `aggregateFeeds`).
- All changes are backward-compatible: existing callers (`createFeedAggregator()` with no args) use the real appStore.