# Plan 007: Fix AGENTS.md drift and add missing .env.example vars

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- AGENTS.md .env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

AGENTS.md is the binding process document that agents follow when working
on this repo. It has drifted from the project rename and config changes:

1. **Wrong container image**: `ghcr.io/greg-hass/youtube-subscriptions:latest`
   → actual is `ghcr.io/greg-hass/mytube:latest`.
2. **Wrong refresh interval default**: `15` minutes → actual is `5`.
3. **Wrong database name**: `youtube-subscriptions.sqlite` → actual primary
   is `mytube.sqlite`.
4. **Missing `FEED_REFRESH_ON_START`** env var documentation.
5. **`.env.example`** omits the three feed-refresh env vars that README and
   docker-compose document.

Wrong image name and DB path directly mislead agent-driven deploys and
edits.

## Current state

**AGENTS.md drift** — confirmed via grep:

```
AGENTS.md:16  → ghcr.io/greg-hass/youtube-subscriptions:latest  (WRONG)
docker-compose.yml:3 → ghcr.io/greg-hass/mytube:latest          (CORRECT)

AGENTS.md:28  → FEED_REFRESH_INTERVAL_MINUTES default: 15  (WRONG)
docker-compose.yml:16 → FEED_REFRESH_INTERVAL_MINUTES=5    (CORRECT)
README.md:156 → FEED_REFRESH_INTERVAL_MINUTES | 5          (CORRECT)
server/feed-refresh-policy.js:79 → parseRefreshIntervalMs(env.FEED_REFRESH_INTERVAL_MINUTES)
```

**Database name**: AGENTS.md references `youtube-subscriptions.sqlite`,
but the primary DB is `mytube.sqlite` (per `server/app-store.js:8-9`).
The old name is mentioned as a legacy migration source in the README.

**`.env.example`** — currently lists:

- `VITE_YOUTUBE_API_KEY`
- `YOUTUBE_API_KEY`
- `BRAVE_API_KEY`
- `OPENCODE_API_KEY`
- `SERVER_API_TOKEN`
- Commented: `ALLOW_INSECURE_UNAUTHENTICATED_API`, `ALLOWED_ORIGINS`,
  rate limit vars

Missing: `FEED_REFRESH_ENABLED`, `FEED_REFRESH_ON_START`,
`FEED_REFRESH_INTERVAL_MINUTES`.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Test      | `npm test -- --run`                  | all pass            |
| Lint      | `npm run lint`                       | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `AGENTS.md`
- `.env.example`

**Out of scope** (do NOT touch):

- `README.md` — already correct for all values.
- `docker-compose.yml` — already correct.
- `server/feed-refresh-policy.js` — code is correct; the doc is wrong.
- Any source code.

## Git workflow

- Branch: `advisor/007-fix-agents-md-env-example`
- Commit message style: `docs: fix AGENTS.md drift and add missing .env.example vars`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix AGENTS.md — container image

Replace all occurrences of `youtube-subscriptions` with `mytube` in
AGENTS.md. Specifically:

- `ghcr.io/greg-hass/youtube-subscriptions:latest` →
  `ghcr.io/greg-hass/mytube:latest`

**Verify**: `grep 'youtube-subscriptions' AGENTS.md` → should return no
matches (except where referring to the legacy DB migration, if any).

### Step 2: Fix AGENTS.md — refresh interval default

Change the `FEED_REFRESH_INTERVAL_MINUTES` default from `15` to `5`:

```
| `FEED_REFRESH_INTERVAL_MINUTES` | No | Refresh interval (default: `5`) |
```

### Step 3: Fix AGENTS.md — database name

Update references to the primary database file:

- `youtube-subscriptions.sqlite` → `mytube.sqlite`

Keep any mention of the legacy name as a migration source if it's in a
"legacy" context. The primary DB is `mytube.sqlite` (per
`server/app-store.js`).

### Step 4: Add FEED_REFRESH_ON_START to AGENTS.md env table

Add a row for `FEED_REFRESH_ON_START` (default: `true`):

```
| `FEED_REFRESH_ON_START` | No | Refresh on startup when cache is stale (default: `true`) |
```

### Step 5: Add feed-refresh vars to .env.example

Add the three missing feed-refresh variables to `.env.example` (commented
with defaults, matching the README's Configuration table):

```bash
# Feed refresh configuration
# FEED_REFRESH_ENABLED=true
# FEED_REFRESH_ON_START=true
# FEED_REFRESH_INTERVAL_MINUTES=5
```

**Verify**: `grep 'FEED_REFRESH' .env.example` → 3+ matches.

### Step 6: Run validation

```bash
npm run lint && npm test -- --run
```

**Verify**: both pass (docs-only change, no code impact).

## Test plan

No new tests — this is a documentation fix. The test suite confirms nothing
depends on the old values.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep 'youtube-subscriptions:latest' AGENTS.md` returns no matches (image fixed)
- [ ] `grep 'FEED_REFRESH_INTERVAL_MINUTES.*15' AGENTS.md` returns no matches (interval fixed)
- [ ] `grep 'FEED_REFRESH_ON_START' AGENTS.md` returns a match (new var documented)
- [ ] `grep 'FEED_REFRESH' .env.example` returns 3+ matches (vars added)
- [ ] `npm run lint` exits 0
- [ ] `npm test -- --run` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The AGENTS.md structure has been significantly reorganized since this
  plan was written (sections moved, table format changed).
- The actual container image name or DB name is different from what
  docker-compose.yml and server/app-store.js say (verify before changing).

## Maintenance notes

- When the project is renamed again (if ever), grep ALL docs for the old
  name — the drift happened because only some files were updated.
- The `.env.example` should be the canonical reference for all env vars.
  Any new env var added to the codebase should be documented here too.
- AGENTS.md should be kept in sync with `docker-compose.yml` and
  `server/feed-refresh-policy.js` — any change to defaults or image names
  needs a docs update in the same commit.
