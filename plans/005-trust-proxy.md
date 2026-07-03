# Plan 005: Add `trust proxy` so rate limiting works behind nginx

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 306aa96..HEAD -- server/app-factory.js server/index.js server/security-middleware.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `306aa96`, 2026-07-03

## Why this matters

In production, nginx proxies `/api/*` to the Express server on
`127.0.0.1:3001`. Express has no `trust proxy` setting, so `req.ip` is
always `127.0.0.1` for every client. The rate limiter keys on `req.ip`
(`security-middleware.js:148`), so all clients share one rate-limit bucket
— per-client abuse isolation doesn't exist. The thumbnail proxy rate
limiter has the same problem. Setting `trust proxy` makes Express parse
`X-Forwarded-For` from nginx, restoring per-client rate limiting.

## Current state

**The missing setting** — `server/app-factory.js:167`:

```js
const app = express();
// ← NO app.set("trust proxy", ...)
```

No `trust proxy` anywhere in the codebase (grep confirms).

**The rate limiter** — `server/security-middleware.js:146–148`:

```js
function getClientKey(req) {
    return req.ip || req.socket?.remoteAddress || "unknown";
}
```

`req.ip` without `trust proxy` returns the TCP peer (`127.0.0.1`).

**nginx config** — sets `X-Forwarded-For` on the proxy pass (confirmed in
`nginx.conf`).

**Deployment topology**: nginx on port 8080 → Express on 127.0.0.1:3001.
Exactly one proxy hop.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Test      | `npm test -- --run`                  | all pass            |
| Lint      | `npm run lint`                       | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `server/app-factory.js` — add `app.set("trust proxy", ...)` after the
  Express app is created.
- `server/security-middleware.test.js` — add a test verifying `req.ip`
  reflects `X-Forwarded-For` when trust proxy is set.

**Out of scope** (do NOT touch):

- `server/security-middleware.js` — `getClientKey` already uses `req.ip`
  correctly; the fix is in the app config, not the middleware.
- `nginx.conf` — already sets `X-Forwarded-For`.
- `docker-compose.yml` — no port/proxy changes needed.

## Git workflow

- Branch: `advisor/005-trust-proxy`
- Commit message style: `fix(security): enable trust proxy for per-client rate limiting behind nginx`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add trust proxy setting

In `server/app-factory.js`, immediately after the `express()` call (line
167), add:

```js
const app = express();

// Trust the single nginx reverse proxy hop so req.ip reflects the real
// client via X-Forwarded-For. This makes per-client rate limiting work.
app.set("trust proxy", 1);
```

**Why `1`**: there is exactly one proxy hop (nginx → Express). Setting the
hop count to the actual number prevents clients from spoofing additional
`X-Forwarded-For` entries to evade limits.

**Verify**: `node -e "const express = require('express'); const app = express(); app.set('trust proxy', 1); console.log(app.get('trust proxy'))"` → `1`

### Step 2: Add a test verifying trust proxy works

In `server/security-middleware.test.js` (or `server/app-factory.test.js`),
add a test that creates the app with `createApp` and verifies that a
request with `X-Forwarded-For` has the correct `req.ip`.

Using supertest (already a devDependency):

```js
it("sets req.ip from X-Forwarded-For when trust proxy is enabled", async () => {
    // Create a minimal app with a test route that returns req.ip
    const express = require("express");
    const app = express();
    app.set("trust proxy", 1);
    app.get("/test-ip", (req, res) => res.json({ ip: req.ip }));

    const response = await request(app)
        .get("/test-ip")
        .set("X-Forwarded-For", "203.0.113.1");

    expect(response.body.ip).toBe("203.0.113.1");
});
```

Also verify that without trust proxy, `req.ip` would be `127.0.0.1` (to
document the difference):

```js
it("ignores X-Forwarded-For without trust proxy", async () => {
    const express = require("express");
    const app = express();
    // No trust proxy set
    app.get("/test-ip", (req, res) => res.json({ ip: req.ip }));

    const response = await request(app)
        .get("/test-ip")
        .set("X-Forwarded-For", "203.0.113.1");

    expect(response.body.ip).not.toBe("203.0.113.1");
});
```

**Verify**: `npm test -- --run security-middleware` → new tests pass.

### Step 3: Run full test suite

```bash
npm test -- --run
```

**Verify**: all tests pass.

## Test plan

- New test: trust proxy parses `X-Forwarded-For` correctly.
- New test: without trust proxy, `X-Forwarded-For` is ignored (documents
  the fix's purpose).
- All existing tests must pass — no existing test depends on `req.ip`
  being `127.0.0.1`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep 'trust proxy' server/app-factory.js` matches (setting added)
- [ ] `npm test -- --run` exits 0, including new trust proxy tests
- [ ] `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- An existing test breaks because it relied on `req.ip` being `127.0.0.1`
  — report which test and what it expected.
- The `createApp` function doesn't expose the Express app in a way that
  allows the trust proxy setting (it should — `app.set` is called on the
  app object before routes are mounted).

## Maintenance notes

- The hop count (`1`) must match the actual deployment topology. If a CDN
  or additional proxy is added in front of nginx, increment to `2`.
- If deploying WITHOUT nginx (direct Express exposure), trust proxy should
  be `false` (the default) — the docker-compose always uses nginx, so this
  is safe for the shipped topology.
- The thumbnail proxy rate limiter (`app-factory.js:90`) also uses `req.ip`
  and now benefits from the fix.
- Reviewer should verify: no test in the suite hardcodes `127.0.0.1` as
  the expected client IP in a way that would mask the fix.
