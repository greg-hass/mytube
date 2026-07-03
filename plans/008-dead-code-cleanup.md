# Plan 008: Remove dead code in channel-search.js and fix opencode shim naming

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- server/channel-search.js server/opencode-channel-resolver.js server/opencode-channel-resolver.test.js server/llm-channel-resolver.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

~180 lines of dead code in `channel-search.js` mislead maintainers reading
the search pipeline — Piped/Invidious/YouTubePage search functions and an
unused `resolveDirectChannel` are tagged `eslint-disable-next-line
no-unused-vars` and have zero callers. Separately, the entire
`opencode-channel-resolver.js` is a 1-line shim
(`module.exports = require("./llm-channel-resolver")`) while its 1015-line
test suite tests logic that lives in `llm-channel-resolver.js` under the
wrong name. Cleaning these up reduces confusion and shrinks the 849-line
`channel-search.js`.

## Current state

### Dead functions in `server/channel-search.js` (849 LOC)

**Three dead search functions** — each tagged `eslint-disable-next-line
no-unused-vars`, not exported, zero callers:

```js
// Line 361-362
// eslint-disable-next-line no-unused-vars
async function searchPipedChannels(...)

// Line 407-408
// eslint-disable-next-line no-unused-vars
async function searchInvidiousChannels(...)

// Line 480-481
// eslint-disable-next-line no-unused-vars
async function searchYouTubePageChannels(query, fetchImpl = fetch, signal)
```

**One dead exported function**:

```js
// Line 662
async function resolveDirectChannel(identity, options = {})

// Line 845 — exported but no external caller
resolveDirectChannel,
```

**Dead imports** feeding these functions:

```js
// Line 2-3 — imported solely for the dead functions
const { pipedInstances, invidiousInstances } = require("./external-services.json");
```

**Verify**: `grep -rn 'searchPipedChannels\|searchInvidiousChannels\|searchYouTubePageChannels\|resolveDirectChannel' server/ src/ | grep -v channel-search.js | grep -v '.test.'`
→ should return no callers outside the definition file.

### The opencode shim — `server/opencode-channel-resolver.js`

```js
// The ENTIRE file:
module.exports = require("./llm-channel-resolver");
```

The test file `server/opencode-channel-resolver.test.js` (1015 lines) tests
logic in `llm-channel-resolver.js` through this shim. There is no
`llm-channel-resolver.test.js`.

**Deprecated aliases** in `llm-channel-resolver.js`:

```js
// Line 352
async function resolveChannelViaOpencode(query, options = {})

// Line 775
function getOpencodeBackendStatus()

// Both exported at lines 803, 808
// Both marked @deprecated in comments
// grep confirms no external caller outside the file/tests
```

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Test      | `npm test -- --run`                  | all pass            |
| Lint      | `npm run lint`                       | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `server/channel-search.js` — delete dead functions, dead imports, dead
  export.
- `server/opencode-channel-resolver.js` — delete the shim file.
- `server/opencode-channel-resolver.test.js` — rename to
  `server/llm-channel-resolver.test.js`, update the require path.
- `server/llm-channel-resolver.js` — remove deprecated aliases
  (`resolveChannelViaOpencode`, `getOpencodeBackendStatus`) and their
  exports.

**Out of scope** (do NOT touch):

- `server/external-services.json` — may still be used by other code; verify
  before removing piped/invidious fields. If the only consumers were the
  dead functions, the fields can be removed, but verify first.
- `server/app-factory.js` — verify it doesn't import from
  `opencode-channel-resolver`. If it does, update the import path.
- `nginx.conf` CSP piped/invidious origins — out of scope (related to the
  Feedy spec's multi-resolver removal, which is a separate direction item).

## Git workflow

- Branch: `advisor/008-dead-code-cleanup`
- Commit message style: `refactor: remove dead channel-search code and fix resolver naming drift`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Verify dead code is truly dead

Run these commands and confirm zero callers:

```bash
# Search functions
grep -rn 'searchPipedChannels\|searchInvidiousChannels\|searchYouTubePageChannels' server/ src/ | grep -v channel-search.js
# resolveDirectChannel (excluding the definition and export in channel-search.js)
grep -rn 'resolveDirectChannel' server/ src/ | grep -v 'channel-search.js'
# opencode shim importers
grep -rn 'opencode-channel-resolver' server/ src/ | grep -v '.test.' | grep -v 'opencode-channel-resolver.js'
# deprecated aliases
grep -rn 'resolveChannelViaOpencode\|getOpencodeBackendStatus' server/ src/ | grep -v 'llm-channel-resolver.js' | grep -v '.test.'
```

**STOP if any of these return results outside the defining file** — the
code isn't actually dead.

**Verify**: all greps return no matches (or only matches within test files
that you'll be updating).

### Step 2: Delete dead functions from channel-search.js

Remove:

- `searchPipedChannels` (lines ~361–405)
- `searchInvidiousChannels` (lines ~407–478)
- `searchYouTubePageChannels` (lines ~480–600)
- `resolveDirectChannel` (lines ~662–715)
- The `eslint-disable-next-line no-unused-vars` comments above each
- `resolveDirectChannel` from the module.exports object (line ~845)

If `pipedInstances` and `invidiousInstances` from the import at line 2-3
are only used by the dead functions, remove those from the import too. If
the import has other fields that ARE used, just remove the dead ones.

**Verify**: `grep -c 'eslint-disable.*no-unused' server/channel-search.js` → 0

### Step 3: Rename opencode test file and update require path

```bash
git mv server/opencode-channel-resolver.test.js server/llm-channel-resolver.test.js
```

In the renamed `llm-channel-resolver.test.js`, update the require path:

```js
// BEFORE:
const resolver = require("./opencode-channel-resolver");
// or similar — check the actual import

// AFTER:
const resolver = require("./llm-channel-resolver");
```

**Verify**: `npm test -- --run llm-channel-resolver` → tests pass.

### Step 4: Delete the opencode shim

```bash
git rm server/opencode-channel-resolver.js
```

**Verify**: `test ! -f server/opencode-channel-resolver.js && echo "deleted"` → "deleted"

### Step 5: Remove deprecated aliases from llm-channel-resolver.js

Remove from `llm-channel-resolver.js`:

- `resolveChannelViaOpencode` function (line ~352)
- `getOpencodeBackendStatus` function (line ~775)
- Both from the `module.exports` object (lines ~803, ~808)

If the test file references these aliases by name, update those references
to use the current function names. Check what the aliases actually call
under the hood — they likely delegate to the primary functions.

**Verify**: `grep 'resolveChannelViaOpencode\|getOpencodeBackendStatus' server/` → no matches.

### Step 6: Run full test suite

```bash
npm test -- --run && npm run lint
```

**Verify**: all tests pass, lint clean.

## Test plan

- The renamed `llm-channel-resolver.test.js` must still pass — it tests
  the same logic, just through the correct module path.
- All other tests must pass — no external code imported the dead functions.
- Lint must be clean (the `eslint-disable` comments are gone with the dead
  code).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c 'eslint-disable.*no-unused' server/channel-search.js` returns `0`
- [ ] `test ! -f server/opencode-channel-resolver.js` succeeds (shim deleted)
- [ ] `test -f server/llm-channel-resolver.test.js` succeeds (test renamed)
- [ ] `grep 'resolveChannelViaOpencode\|getOpencodeBackendStatus' server/*.js` returns no matches
- [ ] `npm test -- --run` exits 0
- [ ] `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep reveals a live caller of any "dead" function — the code
  isn't dead, do NOT delete it.
- The test file's require path is more complex than a single
  `require("./opencode-channel-resolver")` (e.g., it destructures specific
  exports that have different names in `llm-channel-resolver.js`).
- `llm-channel-resolver.js` has other code that depends on the deprecated
  aliases internally.
- The renamed test file fails to run — report the error.

## Maintenance notes

- If the Feedy spec's multi-resolver removal (direction item D1) proceeds
  later, it will remove `llm-channel-resolver.js` and
  `brave-channel-search.js` entirely. This plan makes that easier by
  cleaning up the naming confusion first.
- The `external-services.json` piped/invidious fields may now be unused —
  verify with `grep -rn 'pipedInstances\|invidiousInstances' server/` and
  remove if confirmed dead. This is safe to include in this plan if found.
- Reviewer should verify: `channel-search.js` still works for its live
  callers (`searchChannels`, `resolveChannelViaLlm`, etc.) — run the
  channel-search test suite specifically.
