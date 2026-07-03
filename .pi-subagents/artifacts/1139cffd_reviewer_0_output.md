## Review

Audit complete — **CORRECTNESS/BUGS only**, read straight from the code, every finding cited to `file:line`. Three findings (one real hazard, two latent/leak). No fixes applied — review-only as instructed.

---

### [CORRECTNESS-01] Feed aggregation's full-snapshot `writeData` clobbers every concurrent mutation (resurrects deleted channels, drops newly-added ones, loses watched state)

- **Evidence**:
  - `server/feed-aggregator.js:~198` — `runAggregation` reads `parsedData` once at the start (`appStore.readData`) and holds that snapshot for the entire multi-minute batched run.
  - `server/feed-aggregator.js:~330` — at the end it writes the stale snapshot back wholesale: `parsedData.subscriptions = subscriptions; … await appStore.writeData(parsedData);`
  - `server/sqlite-store.js:300` (`writeDataSnapshot`) — computes `removedIds` by diffing the **current** DB rows against `nextIds` from `parsedData`, then **upserts all** of `parsedData.subscriptions` and deletes `removedIds` (with `trackSubscriptionChanges=false`, so no tombstones are created).
  - `server/sqlite-store.js:276` (`upsertSubscriptions`) — every upsert runs `clearTombstone.run(subscription.id)`, so a channel deleted mid-run is not only re-inserted but its **tombstone is wiped** (defeating the `mergeIncomingSubscriptions` de-dup that the delete flow relies on).
  - `server/sqlite-store.js:227` — `writeAppState("watched_videos", …)` and `writeAppState("settings", …)` are written from the same stale `parsedData`, so any `markAsWatched`/settings change pushed via `/api/sync` during the run is overwritten.
- **Impact**: A scheduled refresh (every 15 min, `feed-refresh-policy.js:1`) or startup refresh runs concurrently with normal user mutations (delete, add, mark-watched) because every sync/delete **also** triggers `aggregateFeeds()` fire-and-forget (`app-factory.js:~360, ~390`). During that window: deleting a channel resurrects it and clears its tombstone; adding a channel mid-run silently drops it (it's in the DB but not in the stale snapshot → deleted, with no tombstone); watched-state and settings changes are lost. The two write paths disagree on merge semantics too — `updateData` is read-merge-write, `writeData` is blind overwrite — and the long-lived `writeData` wins.
- **Effort**: M (a day-ish). Re-read at write time or switch the final save to a `updateData` merge that preserves concurrent adds/watched-state and respects tombstones; add an integration test simulating a delete during aggregation.
- **Risk**: MED — aggregation is load-bearing; changing its persistence path needs care not to regress subscription metadata refresh.
- **Confidence**: HIGH (read the full read→mutate→write path; no intervening re-read exists).
- **Fix sketch**: Have the final save re-read current data and merge (union subscriptions preserving concurrent adds, skipping tombstoned ids, and taking fresh `watchedVideos`/`settings`) instead of overwriting with the start-of-run snapshot; or record the start revision and re-base.

---

### [CORRECTNESS-02] `POST /api/subscriptions/:id/mute` mutates a subscription without bumping `sync_revision`

- **Evidence**:
  - `server/app-factory.js:545` — mute handler calls `appStore.updateSubscriptionField(id, "isMuted", isMuted)`.
  - `server/sqlite-store.js:417` → `applySubscriptionFieldUpdate` (line 369) — a raw `UPDATE subscriptions SET value_json = json_set(…)` with **no** revision write.
  - `server/sqlite-store.js:230,245` — `sync_revision` is bumped **only** inside `writeDataSnapshot` (the `writeData`/`updateData` path); grep confirms `applySubscriptionFieldUpdate` never touches it.
  - `server/app-factory.js:~315` (GET `/api/sync`) and `:~355` (POST `/api/sync` If-Match) both key off `syncRevision`/ETag.
- **Impact**: A mute via this endpoint changes DB state but leaves the ETag/revision unchanged, so ETag-cached clients miss the change and a stale If-Match push won't conflict — the optimistic-concurrency invariant the rest of the app relies on is silently violated. **Latent**: the frontend (`src/lib/subscription-cache.ts` `toggleMuteHandler`) updates local IndexedDB and propagates mute through the full `/api/sync` push, which *does* bump revision — I found no frontend caller of the `/mute` route (grep for `/mute` in `src/` returns nothing). So impact today is low, but it's a reachable shipped endpoint with a real consistency defect.
- **Effort**: S — route the field update through `updateData` (or bump `sync_revision` in `applySubscriptionFieldUpdate`).
- **Risk**: LOW.
- **Confidence**: HIGH (code path is unambiguous).
- **Fix sketch**: Make `updateSubscriptionField` go through the revisioned write path so the ETag/If-Match invariant holds for any caller.

---

### [CORRECTNESS-03] `getDB()` opens a new `IDBDatabase` connection on every operation and never closes it

- **Evidence**:
  - `src/lib/indexeddb.ts:244` — `getDB()` calls `openDatabase(DB_NAME)` (line 70, a fresh `indexedDB.open`) on **every** call and returns the result.
  - Every public op routes through `getDB()`: `executeTransaction` (line 280), `executeCursor` (line 308), `addSubscriptions` (line 364), `addCachedVideos`, `removeCachedVideosByChannel`, `removeOldCachedVideos`, `replaceSubscription`, `writeAllToStore`. None of these `.close()` the returned `db`.
  - `getDB()` (line 244) also re-runs `migrateLegacyDatabaseIfNeeded` → `databaseExists(LEGACY_DB_NAME)` (line 109, an open+abort probe) on every single read/write.
- **Impact**: A long-lived browser session accumulates many open IDBDatabase connections to the same DB. The concrete correctness consequence is `deleteDatabase()` (line ~560, used by clear-all/reset): it registers `onblocked` → rejects with "Database deletion blocked" (line ~586) whenever leaked connections are still open. Also a per-op performance tax (re-opening + legacy probe on every call).
- **Effort**: S — keep a single shared connection (lazy-open, reused) and close it once; gate the legacy probe behind a one-time flag.
- **Risk**: LOW (with a regression check on the clear-all/delete path).
- **Confidence**: HIGH (definitive from the code).
- **Fix sketch**: Cache the open connection in a module-level promise and reuse it; run the legacy migration probe once at first open.

---

### Checked and deliberately cleared (not bugs)
- **`/api/sync` If-Match TOCTOU**: the revision check and `updateData`'s internal snapshot read happen in the same synchronous tick before the first `await`; Node's microtask model prevents cross-request interleaving between read and write. Not a bug.
- **Resolver quota "lost"**: initially suspected quota wasn't persisted on the no-op resolution path, but the end-of-aggregation `writeData(parsedData)` persists `settings.quotaUsed` regardless. Verified false — dropped.
- Scheduled-refresh joining/serialization, the `unref`'d bucket-cleanup interval, and the archived-Shorts backfill (serialized against aggregation via the `archivedShortsBackfillPromise` gate) are all sound.