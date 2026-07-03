# Plan 001: Remove committed `.env` from git, gitignore it, document rotation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- .gitignore .dockerignore .env .env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

`.env` is tracked in git (953 bytes) containing `SERVER_API_TOKEN`,
`YOUTUBE_API_KEY`, `BRAVE_API_KEY`, `OPENCODE_API_KEY`, and
`VITE_YOUTUBE_API_KEY`. `.gitignore` has **no `.env` rule**. Anyone with
repo access has the bearer token gating every API route. A committed secret
is burned — deletion doesn't un-leak it from history. This plan removes the
file from tracking and adds the gitignore/dockerignore rules; **credential
rotation and history scrubbing are documented as manual prerequisites** that
the operator must perform (the executor must NOT attempt history rewriting).

## Current state

- `.gitignore` — has rules for `node_modules`, `dist`, `*.local`,
  `server/data/**/*.sqlite`, editor dirs, etc. **No `.env` rule.**
- `.dockerignore` — excludes `.env.local` and `.env.*.local` but **not
  `.env`**. The `COPY . .` in the Dockerfile build stage (line 8) includes
  it, and `VITE_YOUTUBE_API_KEY` gets inlined into the built frontend
  bundle via `import.meta.env`.
- `.env` — tracked file (added in commit `d3c3f9b`, updated `e7806a6`).
- `.env.example` — the template with placeholder values, already tracked
  and correct.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Lint      | `npm run lint`           | exit 0              |
| Test      | `npm test -- --run`      | all pass            |

## Scope

**In scope** (the only files you should modify):

- `.gitignore`
- `.dockerignore`

**Out of scope** (do NOT touch):

- `.env` itself — `git rm --cached` untracks it but the file must remain on
  disk for local dev. Do NOT delete the file.
- `.env.example` — already correct.
- Git history rewriting — this is a **manual operator step** documented in
  the plan but NOT performed by the executor.
- Credential rotation — manual operator step.

## Git workflow

- Branch: `advisor/001-remove-committed-env`
- Commit message style: `fix(security): untrack .env and add to gitignore/dockerignore`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `.env` rules to `.gitignore`

Add the following lines to `.gitignore`, in the existing "environment" area
(near the `*.local` rules):

```
# Environment files — never commit secrets
.env
.env.*
!.env.example
```

The `!.env.example` negation ensures the template stays tracked.

**Verify**: `grep -c '\.env' .gitignore` → should output `3` or more.

### Step 2: Add `.env` to `.dockerignore`

Add `.env` to `.dockerignore` so it doesn't enter the Docker build context:

```
# Never include live secrets in the build context
.env
```

**Verify**: `grep '\.env' .dockerignore` → should include `.env` (not just
`.env.local`).

### Step 3: Untrack `.env` from git

```bash
git rm --cached .env
```

This stops tracking the file without deleting it from disk.

**Verify**: `git ls-files .env` → no output (file is no longer tracked).
**Verify**: `test -f .env && echo "file exists"` → "file exists" (still on disk).

### Step 4: Verify the example template is still tracked

```bash
git ls-files .env.example
```

Should output `.env.example` — confirming the negation rule works.

**Verify**: `git status --short` → shows `.gitignore`, `.dockerignore`
modified, and `.env` deleted from index (but not from working tree).

### Step 5: Run validation

```bash
npm run lint && npm test -- --run
```

**Verify**: both pass (no test depends on `.env` being tracked).

## Test plan

No new tests needed — this is a config-only change. The existing test suite
confirms nothing depends on `.env` being in git.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git ls-files .env` returns no output (untracked)
- [ ] `test -f .env` succeeds (file still on disk)
- [ ] `git ls-files .env.example` returns `.env.example` (still tracked)
- [ ] `grep '.env$' .gitignore` matches (rule exists)
- [ ] `grep '^\.env$' .dockerignore` matches (rule exists)
- [ ] `npm run lint` exits 0
- [ ] `npm test -- --run` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `git rm --cached .env` fails or the file doesn't exist on disk.
- `.env.example` gets untracked by the new `.gitignore` rules (the
  negation `!.env.example` isn't working).
- Any test fails after the change.

## Maintenance notes

**CRITICAL — Manual operator steps after this plan lands:**

1. **Rotate ALL credentials** that were in `.env`:
   - `SERVER_API_TOKEN` — generate new: `openssl rand -hex 32`
   - `YOUTUBE_API_KEY` — revoke old in Google Cloud Console, create new
   - `BRAVE_API_KEY` — revoke old in Brave dashboard, create new
   - `OPENCODE_API_KEY` — revoke old, create new
   - `VITE_YOUTUBE_API_KEY` — regenerate if used
2. **Update the running stack** with the new token:

   ```bash
   export SERVER_API_TOKEN="<new token>"
   docker compose up -d
   ```

3. **Scrub git history** (if the repo is or may become public):

   ```bash
   # Option A: BFG Repo-Cleaner
   bfg --delete-files .env
   git reflog expire --expire=now --all && git gc --prune=now

   # Option B: git filter-repo
   git filter-repo --path .env --invert-paths
   ```

   Then force-push and coordinate with any forks.
4. **Delete old session files** that may contain the leaked token in
   `~/.pi/agent/sessions/`.

- Future `.env` changes should never be committed — the new gitignore rule
  prevents accidental re-addition.
- If CI needs secrets, use GitHub repository secrets, not a committed file.
