# Progress — Correctness/Bug audit of MyTube (session 1139cffd)

Role: review-only auditor (CORRECTNESS/BUGS only). No code edits made.

## Scope read

- Server: app-factory.js, index.js, feed-aggregator.js, app-store.js, sqlite-store.js,
  feed-fetcher.js, subscription-resolver.js, subscription-merge.js, security-middleware.js,
  feed-refresh-policy.js, video-archive.js, shorts-status.js, sqlite-backup.js, utils.js,
  migrations-runner.js
- Frontend: useSubscriptionStorage.ts, useRSSVideos.ts, useServerStatus.ts, useQueuedVideos.ts,
  sync-reconcile.ts, server-sync.ts, subscription-sync.ts, subscription-cache.ts, video-progress.ts,
  local-storage-list.ts, indexeddb.ts, app-backup.ts, store/* (slices), Dashboard.tsx (effects)

## Findings (evidence-backed)

1. [CORRECTNESS-01, HIGH] feed-aggregator end-of-run full-snapshot writeData clobbers concurrent
   writes: resurrects deleted subscriptions, clears their tombstones, silently drops
   subscriptions added mid-run, and overwrites watchedVideos/settings with the stale
   start-of-run snapshot.
2. [CORRECTNESS-02, MED] POST /api/subscriptions/:id/mute mutates a subscription row without
   bumping sync_revision (applySubscriptionFieldUpdate is a raw UPDATE). Breaks ETag/If-Match
   invariant. Latent: not currently called by the frontend (mute propagates via /api/sync push).
3. [CORRECTNESS-03, MED] indexeddb.ts getDB() opens a new IDBDatabase connection on every
   operation and never .close()s it (resource leak); also re-probes the legacy DB each call.
   Can trigger onblocked on deleteDatabase.

## Confirmed NOT bugs (checked, dropped)

- /api/sync If-Match check vs updateData: revision check + snapshot read happen in the same
  synchronous tick before the first await; microtask model prevents cross-request interleaving.
- Resolver quota NOT lost: end-of-aggregation writeData persists settings.quotaUsed even on
  the no-change path (initially suspected a bug — verified false).
- LRU/rate-limiter cleanup interval is unref'd; scheduled refresh joins/serializes correctly;
  shorts-status backfill is serialized against aggregation via archivedShortsBackfillPromise gate.

## Status: COMPLETE — findings returned to supervisor. No files changed in the repo
