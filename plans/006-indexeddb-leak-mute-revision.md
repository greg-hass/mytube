# Plan 006: Fix IndexedDB connection leak and mute endpoint revision bump

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- src/lib/indexeddb.ts server/sqlite-store.js server/app-factory.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

Two independent correctness bugs, both small fixes:

1. **IndexedDB connection leak**: `getDB()` opens a fresh `IDBDatabase`
   connection on every operation and never closes it. A long browser
   session accumulates many open connections, and `deleteDatabase()` (used
   by clear-all/reset) fails with "Database deletion blocked" when leaked
   connections are open.

2. **Mute endpoint doesn't bump `sync_revision`**: the `/api/subscriptions/:id/mute`
   endpoint mutates a subscription via `applySubscriptionFieldUpdate` which
   does a raw `UPDATE` without incrementing the revision. This breaks the
   ETag/If-Match optimistic-concurrency invariant. Latent today (no
   frontend caller), but it's a shipped endpoint with a real consistency
   defect.

## Current state

### Bug 1: IndexedDB leak — `src/lib/indexeddb.ts`

```typescript
// Line 92-96 — called on EVERY operation:
async function getDB(): Promise<IDBDatabase> {
    const db = await openDatabase(DB_NAME);         // fresh open every time
    await migrateLegacyDatabaseIfNeeded(db);        // runs every time too
    return db;
}
```

Every public function (`executeTransaction`, `addSubscriptions`,
`replaceSubscription`, `writeAllToStore`, etc.) calls `getDB()` and never
calls `.close()` on the result.

The `openDatabase` function (line 70) calls `indexedDB.open(name, DB_VERSION)`
which creates a new connection each time.

### Bug 2: Mute revision — `server/sqlite-store.js`

```js
// Line 369-376 — raw UPDATE, no revision bump:
function applySubscriptionFieldUpdate(id, field, value) {
    const database = getDb();
    database.prepare(`
        UPDATE subscriptions SET value_json = json_set(value_json, ?, json(?)) WHERE id = ?
    `).run(`$.${field}`, JSON.stringify(value), id);
}
```

Meanwhile `writeDataSnapshot` (line ~245) bumps `sync_revision`:

```js
writeAppState("sync_revision", nextRevision, updatedAt);
```

The mute route calls this via `appStore.updateSubscriptionField(id, "isMuted",
isMuted)` at `app-factory.js:545`.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `npm run type-check`                 | exit 0              |
| Lint      | `npm run lint`                       | exit 0              |
| Test      | `npm test -- --run`                  | all pass            |

## Scope

**In scope** (the only files you should modify):

- `src/lib/indexeddb.ts` — cache the database connection.
- `server/sqlite-store.js` — bump `sync_revision` in
  `applySubscriptionFieldUpdate`.

**Out of scope** (do NOT touch):

- `server/app-factory.js` — the mute route handler is fine; the fix is in
  the store.
- `src/lib/indexeddb.ts` migration logic — keep the migration, just run it
  once.
- Any other store functions.

## Git workflow

- Branch: `advisor/006-indexeddb-leak-mute-revision`
- Commit message style: `fix: cache IndexedDB connection and bump sync_revision on mute`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Cache the IndexedDB connection

In `src/lib/indexeddb.ts`, replace the per-call `getDB()` with a cached
singleton. Add a module-level promise variable near the top of the file:

```typescript
let dbPromise: Promise<IDBDatabase> | null = null;
let legacyMigrationDone = false;
```

Replace `getDB()` (line 92):

```typescript
async function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
        dbPromise = openDatabase(DB_NAME);
    }
    const db = await dbPromise;
    if (!legacyMigrationDone) {
        await migrateLegacyDatabaseIfNeeded(db);
        legacyMigrationDone = true;
    }
    return db;
}
```

**Key points**:

- The open promise is cached and reused — `openDatabase` runs once.
- The legacy migration probe runs once on first successful open, not every
  call.
- The connection stays open for the page lifetime — this is the standard
  IndexedDB pattern.
- `deleteDatabase()` needs special handling (see Step 2).

**Verify**: `npm run type-check` → no type errors.

### Step 2: Handle deleteDatabase with the cached connection

The existing `deleteDatabase()` function (around line ~560) needs to close
the cached connection before attempting deletion. Add before the
`indexedDB.deleteDatabase` call:

```typescript
// Close the cached connection so deletion isn't blocked
if (dbPromise) {
    try {
        const db = await dbPromise;
        db.close();
    } catch {
        // Connection may already be closed
    }
    dbPromise = null;
    legacyMigrationDone = false;
}
```

**Verify**: `npm run type-check` → no type errors.

### Step 3: Bump sync_revision in applySubscriptionFieldUpdate

In `server/sqlite-store.js`, modify `applySubscriptionFieldUpdate` (line
369) to also bump the revision:

```js
function applySubscriptionFieldUpdate(id, field, value) {
    const database = getDb();
    const write = database.transaction(() => {
        database.prepare(`
            UPDATE subscriptions SET value_json = json_set(value_json, ?, json(?)) WHERE id = ?
        `).run(`$.${field}`, JSON.stringify(value), id);
        writeAppState("sync_revision", getRevision() + 1, ISO_NOW());
    });
    write();
}
```

Wrap both statements in a transaction so they're atomic.

**Verify**: `npm test -- --run` → existing tests pass.

### Step 4: Add tests

**For Bug 2** — in `server/app-factory.test.js` or
`server/sqlite-store.test.js`, add a test:

```js
it("bumps sync_revision when updating a subscription field", async () => {
    // Setup: create store with a subscription
    const store = createSqliteStore({ databaseFile: ":memory:" });
    await store.init({ defaultData: { subscriptions: [{ id: "UC001", title: "Test" }] }, defaultVideoCache: { videos: [] } });
    const before = store.getCurrentRevision();
    store.updateSubscriptionField("UC001", "isMuted", true);
    const after = store.getCurrentRevision();
    expect(after).toBeGreaterThan(before);
});
```

**For Bug 1** — verify `getDB` reuses the connection:

```typescript
it("getDB returns the same connection on repeated calls", async () => {
    const db1 = await getDB();
    const db2 = await getDB();
    expect(db1).toBe(db2);
});
```

**Verify**: `npm test -- --run` → new tests pass.

### Step 5: Run full test suite

```bash
npm test -- --run
```

**Verify**: all tests pass.

## Test plan

- New test: `getCurrentRevision()` increases after `updateSubscriptionField`.
- New test: `getDB()` returns the same `IDBDatabase` instance on repeated
  calls.
- All existing tests must pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep 'dbPromise' src/lib/indexeddb.ts` matches (connection caching)
- [ ] `grep 'sync_revision' server/sqlite-store.js` shows a match inside or near `applySubscriptionFieldUpdate`
- [ ] `npm run type-check` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test -- --run` exits 0, including new tests
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `indexeddb.ts` structure doesn't match (exports are different, the
  `getDB` function has been refactored already).
- The `sqlite-store.js` `applySubscriptionFieldUpdate` uses different
  parameter names or structure.
- An existing test depends on `getDB()` opening a fresh connection each
  time (unlikely, but report if found).
- `createSqliteStore` isn't the actual factory function name — check the
  export from `sqlite-store.js`.

## Maintenance notes

- The cached IndexedDB connection stays open for the page lifetime. If a
  `versionchange` event fires (another tab upgrades the DB), the connection
  auto-invalidates and the next `getDB()` call will re-open. Consider
  adding `db.onversionchange = () => { db.close(); dbPromise = null; }` as
  a follow-up hardening if multi-tab issues arise.
- The `sync_revision` bump in `applySubscriptionFieldUpdate` makes the mute
  endpoint participate in optimistic concurrency. If a frontend caller is
  added later, it will need to handle 412 conflicts like the sync flow.
- Both fixes are backward-compatible — no API shape changes.
