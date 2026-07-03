Both clean. Here's the final report:

---

STATUS: COMPLETE

STEPS:
- Step 1 (Cache IndexedDB connection): Done — added module-level `dbPromise` and `legacyMigrationDone` vars, modified `getDB()` to cache the connection. **Verify**: `npm run type-check` → pass
- Step 2 (deleteDatabase with cached connection): Done — added cached connection close + state reset before the deletion loop. **Verify**: `npm run type-check` → pass
- Step 3 (Bump sync_revision in applySubscriptionFieldUpdate): Done — wrapped field update + revision bump in a transaction. **Verify**: `grep 'sync_revision' server/sqlite-store.js` → line 377 inside function
- Step 4 (Add tests): Done — added "bumps sync_revision when updateSubscriptionField is called" test. **Verify**: `npm test -- --run sqlite-store` → 9/9 pass
- Step 5 (Full test suite): Done — 495 passed, 4 failed (all from other concurrently-executing plans, zero from my changes)

FILES CHANGED:
- `src/lib/indexeddb.ts` — cached DB connection, updated deleteDatabase
- `server/sqlite-store.js` — bumped sync_revision in applySubscriptionFieldUpdate
- `server/sqlite-store.test.js` — added test for revision bump on updateSubscriptionField

NOTES:
- The 4 test failures are from other plans (002, 003, 004) executing concurrently and do not relate to plan 006's changes.
- IndexedDB connection reuse can't be unit-tested in jsdom (no IndexedDB support). This is a runtime verification item.
- Changes staged in git but not committed (no `/commit` access in subagent).