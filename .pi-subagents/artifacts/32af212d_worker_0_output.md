No files outside scope. Let me also verify the reverse: that all the changes are in-scope files:

Good — clean. Now let me produce the acceptance report.

---

## Acceptance Report

**STATUS: COMPLETE**

**STEPS:**
- **Drift check**: `git diff --stat 306aa96..HEAD -- server/feed-aggregator.js server/sqlite-store.js` — plan 002 already renamed `appStore.` → `store.` and added `storeOverride` parameter. The plan's excerpts use `appStore.` but the actual variable is `store.` — same semantics, not a drift issue. Proceeded.
- **Step 1 (Replace writeData with updateData merge)**: Done — replaced the final `store.writeData(parsedData)` (line ~448) with `store.updateData(DEFAULT_DATA, (current) => {...})` merge. Merge function: builds aggregator's subscription metadata map, merges subscriptions (preserving concurrent adds), unions redirects, preserves current watched/settings state, only overwrites quota tracking.
- **Step 2 (Update characterization tests)**: Done — updated 3 existing tests that asserted on `writeData` to assert on `updateData` instead. Added concurrent-mutation test "does not clobber subscriptions added during aggregation".
- **Step 3 (Verify)**: `npm test -- --run feed-aggregator` → 8/8 pass. `npm test -- --run` → 501/501 pass. `npm run lint` → clean.

**STOP CONDITIONS:** None triggered.

**FILES CHANGED:**
- `server/feed-aggregator.js` — replaced final `writeData` with `updateData` merge
- `server/feed-aggregator-internals.test.js` — updated characterization tests, added concurrent-mutation test

**NOTES:**
- Two intermediate `store.writeData(parsedData)` calls remain at lines ~301 and ~323 (redirect/resolve saves). These happen near the start of aggregation with a small race window — intentionally not changed per the plan's scope.
- The `updateData` method re-reads current DB state before calling the merge function, and writes with `previousSubscriptions: current.subscriptions` (automatically set by `updateData`), which preserves concurrent adds and respects tombstones.
- Cannot commit in worktree (AOP restriction in subagent context). Changes are staged.