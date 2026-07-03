Right, that's the lot. Security audit of MyTube, evidence-backed, findings only — no fixes applied, no audited code touched. Here's the state of play.

## Review

**Correct (defensive controls already in place):**
- `security-middleware.js`: bearer auth uses `crypto.timingSafeEqual` (timing-safe), public-read exemption scoped to exactly `/healthz` + `/channel-thumbnail`, and a clean 503 when no token is configured unless the opt-in `ALLOW_INSECURE_UNAUTHENTICATED_API` hatch is set.
- **No SSRF**: thumbnail proxy (`app-factory.js:75`) hard-allowlists 3 YouTube image hosts over HTTPS-only; `resolve-channel` (`app-factory.js:427`) constrains `value` to `[\w.@\-/]+` and always prefixes `https://www.youtube.com/`; all channel-search fetches target youtube.com / googleapis / Brave with `encodeURIComponent`. `feed-fetcher.js` builds URLs only from validated `UC…` channel IDs.
- **No SQL injection today**: every store query uses `?` placeholders + bound `json_each(?, '$')`.
- **No XSS sinks** in `src/` (no `innerHTML`/`dangerouslySetInnerHTML`/`eval`/`document.write`).
- **No credential logging**: every server log uses `error.message`; the `x-youtube-api-key` header is consumed but never logged; the LLM key goes in an `Authorization` header only.
- **No CSRF surface**: auth is a bearer header, not a cookie — correct by design.
- `nginx.conf` ships a strong header set incl. a CSP with **no `unsafe-eval`/`unsafe-inline`** for scripts. Dockerfile runs as non-root `node`. `npm audit --omit=dev`: **0 vulnerabilities** (root + server).

---

### [SEC-01] Committed `.env` exposes live API credentials in git history

- **Evidence**: `.gitignore` has **no `.env` rule** (read in full). `.env` is a tracked blob in HEAD: `100644 blob a31454c1… 953 .env` (added `d3c3f9b`, updated `e7806a6`). Per `.env.example`, that file holds `SERVER_API_TOKEN`, `YOUTUBE_API_KEY`, `VITE_YOUTUBE_API_KEY`, `BRAVE_API_KEY`, `OPENCODE_API_KEY`. `server/index.js:14-26` loads `.env` at runtime; `docker-compose.yml:12` interpolates `SERVER_API_TOKEN`. `.dockerignore` excludes `.env.local` but **not `.env`** — so it enters the `COPY . .` build context, and any `VITE_YOUTUBE_API_KEY` value is inlined into the shipped frontend bundle (`src/lib/youtube-api.ts:54` reads `import.meta.env.VITE_YOUTUBE_API_KEY`).
- **Impact**: `SERVER_API_TOKEN` is the single bearer secret gating **every** `/api` route (`security-middleware.js` `apiKeyAuth`). Anyone with repo/history/CI-cache access has full read+write API access (all subscriptions + watch history, overwrite/delete data, trigger refreshes). A committed secret is **burned** — deleting the file doesn't un-leak it from history, forks, or published image build layers. The `VITE_` key is additionally extractable from the deployed site bundle by any visitor (quota-theft vector). *(No secret values were read or reproduced — Rule 3.)*
- **Effort**: M
- **Risk**: MED — history rewrite changes SHAs (needs team coordination); rotation requires updating the running stack + any CI secrets.
- **Confidence**: HIGH — git tree metadata proves tracking; runtime loader + 953-byte size prove it's live config, not a placeholder.
- **Fix sketch**: add `.env` + `*.env` to `.gitignore`; `git rm --cached .env`; purge from history (filter-repo/BFG); **rotate every credential in the file**; move secrets to deploy-time env/docker-secrets, never a tracked file.

### [SEC-02] Rate limiting is defeated behind the reverse proxy (no `trust proxy`)

- **Evidence**: grep found **no `app.set("trust proxy", …)`** anywhere. The write limiter keys on `req.ip` (`security-middleware.js:148`) and the thumbnail proxy on `req.ip` (`app-factory.js:90`). `nginx.conf` proxies `/api/` to `127.0.0.1:3001` and sets `X-Forwarded-For`, and is the documented prod entrypoint (Dockerfile: nginx on 8080). With trust proxy unset, Express ignores `X-Forwarded-For`, so `req.ip === "127.0.0.1"` for **all** clients.
- **Impact**: `API_WRITE_RATE_LIMIT_MAX=30/60s` and `THUMBNAIL_PROXY_RATE_MAX=60/min` collapse into **one global bucket** shared by every client. Per-client abuse isolation — the entire point of the limiter — doesn't exist in the shipped topology. Notably the thumbnail proxy is **unauthenticated**, so its collapsed bucket enables a trivial unauthenticated DoS on thumbnail loading for all users.
- **Effort**: S
- **Risk**: LOW-MED — the hop count must match reality (1 here); over-trusting lets clients spoof IPs to evade limits.
- **Confidence**: HIGH — direct code + deployment evidence.
- **Fix sketch**: set `app.set("trust proxy", 1)` (or a configured value) in `app-factory.js`, and only key the limiter on `X-Forwarded-For` when trust proxy is enabled.

---

### Notes (low severity / latent — recorded so they're not re-discovered)

- **[SEC-03] Latent SQL string-interpolation sinks** — `sqlite-store.js` `applySubscriptionFieldUpdate` builds `json_set(value_json, '$.${field}', …)` and `copyTableRows` interpolates `${tableName}`/`${columns}`. Both are reachable **only** with hardcoded literals today (`"isMuted"` at `app-factory.js:477`; fixed table names in `migrateLegacyDatabaseIfNeeded`), so **not currently exploitable**. A future endpoint passing request-derived `field`/table would be injection. Hardening: allowlist/parametrize. *Confidence HIGH on the pattern, LOW as a live vuln.*
- **[SEC-04] Unauthenticated thumbnail relay** — `/api/channel-thumbnail?url=` is public GET, allowlisted to 3 YouTube image hosts over HTTPS (no arbitrary SSRF), but it's an open, server-side-fetched relay whose only abuse control is the SEC-02-broken limiter. Consider requiring auth or per-real-client keying.
- **[SEC-05] CSP `connect-src` enumerates third-party public CORS proxies** — `nginx.conf` lists `api.allorigins.win`, `api.codetabs.com`, and Piped/Invidious instances; `fallback-api.ts` sends user channel-search queries to them. Data-minimization/privacy concern (query leakage to third parties), by-design fallback. Low.

---

Bottom line: one **critical** (SEC-01 — rotate everything, scrub history, gitignore `.env`) and one **med** (SEC-02 — `trust proxy`). The SSRF/auth-validation/CSP/XSS posture is genuinely solid; the damage is concentrated in the committed secrets and the proxy-header handling. No code was changed — review only.