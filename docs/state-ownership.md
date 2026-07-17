# State ownership and synchronization

MyTube is local-first in the browser but uses the server as the durable shared
snapshot. This document defines which store owns each field and the invariants
that synchronization, backup, deletion, and recovery code must preserve.

## Ownership matrix

| Data | Authoritative durable store | Browser copy | Synchronization contract |
| --- | --- | --- | --- |
| Subscriptions and channel metadata | SQLite | IndexedDB | Startup unions local and remote rows. Server metadata fills channel fields. Deletions use server tombstones so an offline browser cannot resurrect a removed channel. |
| Subscription favorites, mute state, and group | SQLite subscription rows | IndexedDB | Preserved during metadata refresh and ID redirects. Browser mutations update its cache and are pushed through the revisioned sync endpoint. |
| Watched video IDs | SQLite sync snapshot | Zustand/localStorage | Browser actions update local state immediately. Reconciliation imports remote state only when explicitly requested and otherwise pushes the merged browser set. |
| Feed videos and channel refresh health | SQLite | React Query memory cache | The server refresh worker is authoritative. Browser cache is disposable and may use ETags/304 responses. |
| Queue and favorite videos | Browser localStorage | React hook state | Device-local by design. Full video snapshots are stored alongside IDs so entries survive feed-cache eviction. Included in full app backup, not server sync. |
| Playback progress | Browser localStorage | React hook state | Device-local and replaceable. It does not affect server watched state until the normal watched workflow runs. |
| Feed filters and saved presets | Browser localStorage | Zustand/React state | Device-local UI preference. Included in full app backup. |
| Theme, layout, sort, quota display, and UI preferences | Browser localStorage | Zustand | Device-local. Selected sync-safe settings may be copied to SQLite, but server data must not overwrite unrelated browser preferences. |
| Server API token | Browser localStorage | Authenticated fetch wrapper | Sent only to same-origin `/api/*` requests. Never included in app backup or server sync. Clearing or replacing it must take effect on the next request. |
| Optional provider credentials | Server environment where supported; otherwise browser localStorage | Zustand | Treat browser-stored keys as readable by any successful same-origin script injection. Never include them in Git, logs, exports, or sync payloads. |

## Required invariants

### Startup and merge

- A network failure falls back to IndexedDB without deleting local subscriptions.
- A 401 is not a network fallback: it must surface the authentication recovery
  UI after the first failed request.
- Server revision and ETag values are recorded before a later mutation is sent.
- Tombstones and canonical channel redirects are applied before union merging.
- `addedAt`, favorite, mute, and group metadata survive refreshes and redirects.

### Writes and conflicts

- Server writes use the last known revision when available.
- A `412 Precondition Failed` never silently overwrites newer server state.
- Explicit destructive actions may retry once after recording the current
  revision; background reconciliation waits for the next sync instead.
- A feed refresh may update channel metadata but must not clobber concurrent
  subscription additions, deletions, watched state, or user metadata.

### Deletion

- Removing a subscription updates IndexedDB and the server.
- The server records a tombstone, and later clients apply it before merging.
- Storage migrations and backups remain backward compatible; tables, columns,
  and the persistent volume path are not removed without a rollback plan.

### Backup and recovery

- SQLite backup/restore is the authoritative server recovery path.
- Full app backup is the browser recovery path for device-local queue,
  favorites, filters, groups, and settings.
- Browser caches and React Query state are reconstructable and are not backups.
- Secrets and the server API token are deliberately excluded from exports.

## Change checklist

Any change to persistence or synchronization must identify the owning store,
offline behavior, conflict behavior, deletion behavior, backup impact, and a
backward-compatible migration path. Tests must cover the relevant invariant,
not only the happy-path component rendering.
