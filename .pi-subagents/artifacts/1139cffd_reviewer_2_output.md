Right, audit's done — read the playbook, dug through the actual code, every finding below is pinned to `file:line`. Baseline's green (491/491 tests, clean type-check/lint, 0 audit vulns), so this is purely about what's worth improving, not what's on fire.

---

## 🎯 Review — MyTube: Performance / Tech Debt / Dependencies

### ✅ Correct (give credit where it's due)
- **No N+1 / batched writes.** `sqlite-store.js` — `upsertSubscriptions` (L131-152), `deleteSubscriptions` (L155-162), `writeVideoCacheSnapshot` (L286-348) all loop prepared statements **inside a single `database.transaction()`**, and eviction uses one `DELETE ... WHERE id NOT IN (SELECT value FROM json_each(...))` statement. Textbook batching.
- **Indexes match query patterns.** `videos` is read `ORDER BY published_at DESC` and the only ad-hoc filter is `channel_id` — both indexed (`001_initial.sql:21-22`).
- **Clean layering.** Zero `src/` imports reach into `server/`. The frontend talks to the app over `/api/*` only.
- **`/api/videos` writes are ETag-aware on the server side** (`app-factory.js:420-426`) — the mechanism exists; it's just not used by the client (see PERF-01).
- **Deps all current, 0 audit vulns.** better-sqlite3 12.10, axios 1.16.1, rss-parser 3.13, React 19.2, Vite 7.3. Tested.

---

### 🔴 [PERF-01] Full ≤5000-video payload re-downloaded every 5-30s; server ETag/304 is dead code; no compression

- **Evidence:**
  - `server/app-factory.js:405-430` — `/api/videos` returns the **entire** `videoCache` JSON (capped at `MAX_ARCHIVED_VIDEOS = 5000` in `feed-aggregator.js:10`) with no pagination/cursor param (`req.query` is only read for thumbnail proxy + status limit).
  - `src/hooks/useRSSVideos.ts:104-116` — the `["server-videos"]` query calls `fetch("/api/videos")` with **no `If-None-Match` header**. The server computes an ETag and supports 304 (`app-factory.js:421-425`), but TanStack Query's plain `fetch` never sends the conditional header, so the 304 branch **never fires on the wire**.
  - `src/hooks/useRSSVideos.ts:117-128` — `refetchInterval` is **5s while aggregating, 30s otherwise**, so during a refresh the full payload is pulled every 5 seconds.
  - No compression middleware anywhere (`app-factory.js` mounts only cors / origin-guard / auth / rate-limit / `express.json`). The multi-MB JSON ships uncompressed.
- **Impact:** Every poll re-fetches and re-parses the whole archive (description fields make each video a few hundred bytes → ~1-3 MB at the cap), repeated every 5s mid-refresh. Heaviest on mobile/slow links and is the single biggest bandwidth/CPU cost in the app.
- **Effort:** M (a day-ish). ETag reuse is S; compression is S; real pagination is M.
- **Risk:** LOW–MED. ETag 304 + gzip are additive and safe; server-side pagination touches the client data contract (risk MED).
- **Confidence:** HIGH — read both sides of the wire.
- **Fix sketch:** (1) Make the client fetcher store the last ETag and send `If-None-Match`, honoring 304 (kills ~99% of poll bytes when nothing changed). (2) Add `compression` middleware to the Express app. (3) Optional: add a `since`/cursor + `limit` to `/api/videos` so the client only pulls the window the virtualized grid actually shows.

---

### 🟠 [DEBT-01] ~180 lines of dead code in `channel-search.js` (+ dead config)

- **Evidence:**
  - `channel-search.js:362-479` — `searchPipedChannels`, `searchInvidiousChannels`, `searchYouTubePageChannels` are each tagged `eslint-disable-next-line no-unused-vars`, are **not exported**, and grep confirms **zero callers** anywhere in `server/` or `src/`.
  - `channel-search.js:607-715` — `resolveDirectChannel` **is** exported but has no caller outside its own definition/export line (only `resolveDirectChannelByScrape` is actually wired into `searchChannels` at L601-606).
  - `channel-search.js:2-3` — `pipedInstances`/`invidiousInstances` from `external-services.json` are imported **solely** to feed the dead Piped/Invidious functions → dead config too.
- **Impact:** Misleads anyone reading the search pipeline ("are Piped/Invidious backends live?" — no), and inflates the 849-line file that's already near the top of the size range.
- **Effort:** S (hours).
- **Risk:** LOW — these have no live path.
- **Confidence:** HIGH — grep-verified.
- **Fix sketch:** Delete the three dead search functions, the unused `resolveDirectChannel`, and its `external-services.json` fields + import. Keep `parseYouTubeChannelSearchResults` only if still referenced (it's exported; verify before removing).

---

### 🟠 [DEBT-02] Channel-resolver naming/test drift: impl in one file, 1015-line test suite under a 1-line shim

- **Evidence:**
  - `server/opencode-channel-resolver.js` — the **entire file** is `module.exports = require("./llm-channel-resolver");` with a comment saying "All logic moved."
  - `server/opencode-channel-resolver.test.js` — **1015 lines / 26.6 KB** of tests, and there is **no `llm-channel-resolver.test.js`**. So the entire LLM-resolver test suite is named after the old module it tests *through a shim*.
  - `llm-channel-resolver.js:284-296` & `:779-792` — deprecated aliases `resolveChannelViaOpencode` and `getOpencodeBackendStatus` (marked `@deprecated`); grep shows **no caller** outside the file/tests.
- **Impact:** A maintainer fixing a resolver bug opens `opencode-channel-resolver.js` expecting logic and finds one line; the real code is a rename away. Deprecated aliases + shim are pure back-compat weight.
- **Effort:** S (hours).
- **Risk:** LOW.
- **Confidence:** HIGH.
- **Fix sketch:** Rename/move the test file to `llm-channel-resolver.test.js`, update its `require` path, delete the shim and the two deprecated aliases. One focused commit.

---

### 🟠 [DEPS-01] Two outbound HTTP clients in the server: `axios` **and** global `fetch`

- **Evidence:**
  - `axios` used for outbound HTTP in: `app-factory.js:513` (`/api/resolve-channel`), `feed-fetcher.js:265` & `:477` (uploads-playlist fallback + `fetchChannelThumbnail`), `shorts-status.js:48,79,115,144`, `subscription-resolver.js:36`.
  - Global `fetch` used for outbound HTTP in: `feed-fetcher.js:380` (`fetchChannelFeed` main path), `channel-search.js` (8+ sites), `brave-channel-search.js`, `llm-channel-resolver.js`, `youtube-api-search.js`.
  - Both are declared/installed: `axios` in `server/package.json`, `fetch` is Node 24 built-in.
- **Impact:** Duplicate dependency solving the same job (per playbook §6). The two have different error shapes (`axios` throws on non-2xx / has `response.status`; `fetch` never throws, manual `response.ok`), so every call site carries subtly different error handling — a consistency hazard.
- **Effort:** M — ~4 files to migrate axios→fetch, each needs timeout (`AbortController`) + status-check parity.
- **Risk:** MED — error/timeout behavior must be preserved per site; `feed-fetcher` + `shorts-status` are on the critical refresh path.
- **Confidence:** HIGH.
- **Fix sketch:** Standardize on `fetch` (already dominant), add one shared `fetchJson`/`fetchText` helper with `AbortController` timeout, then remove `axios` from `server/package.json`.

---

### 🟡 [DEBT-03] `VirtualizedVideoGrid` — `handleVideoUnavailable` not memoized, passed to every `VideoCard`

- **Evidence:** `VirtualizedVideoGrid.tsx:66-76` — `handleVideoUnavailable` is a fresh closure on every render, and it's handed to each `<VideoCard onUnavailable={...}>` (L213). Sibling `handleInlinePlaybackChange` **is** wrapped in `useCallback` (L58-64), so this one stands out as inconsistent.
- **Impact:** Any grid re-render (e.g. `unavailableVideoIds` change, parent prop change) gives every rendered `VideoCard` a new `onUnavailable` prop, busting any memoization and re-rendering all visible cards.
- **Effort:** S.
- **Risk:** LOW.
- **Confidence:** MED — real pattern, impact depends on whether `VideoCard` is itself memoized.
- **Fix sketch:** Wrap `handleVideoUnavailable` in `useCallback` (set-state already uses functional update, so deps are empty).

---

### 🟡 [DEPS-02] Framework major-version lag — Express 4, zustand 4 (both optional, neither EOL)

- **Evidence:** `server/package.json` declares `express ^4.18.2` (installed **4.22.2**); root declares `zustand ^4.5.7` (installed **4.5.7**). Express 5 is GA; zustand 5 is released.
- **Impact:** Low. Express 4.x is still receiving fixes (4.22 is current) and zustand 4.5.7 is fine — these are **not** EOL/security-driven. Noted for awareness, not as a recommended migration. (If you ever want streaming route handlers / the newer middleware shapes, Express 5 is the trigger.)
- **Effort:** L (Express 5 has breaking middleware/route changes; zustand 5 is a smaller but app-wide store migration).
- **Risk:** MED–HIGH for Express (route/handler API changes touch `app-factory.js` + `security-middleware.js`).
- **Confidence:** MED.
- **Verdict:** Don't do this for its own sake. Only revisit if a concrete 5.x feature is wanted.

---

### 📝 Considered & rejected (so you know I checked)
- **"rss-parser AND fast-xml-parser = duplicate XML dep?"** — No. `rss-parser` parses YouTube RSS (server); `fast-xml-parser` parses OPML (frontend, `opml-parser.ts`), and `OPMLUpload` is already `lazy()`-code-split. Different purposes, already lazy. Not a finding.
- **Dashboard re-render hotspots** — the heavy `useMemo`s (`activeChannels`, `filteredVideos`, `inProgressVideos`) are all dependency-memoized correctly. The only wart is the `activeChannels` early-`continue` that comments about "stop"ing but never `break`s (`Dashboard.tsx:283-322`) — micro, not worth a finding.

---

### 📋 acceptance-report
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Audit delivered within the requested scope (Performance / Tech Debt & Architecture / Dependencies & Migrations). Did not widen into Security/Correctness or apply any code changes. Every finding carries file:line evidence; non-findings explicitly noted as considered/rejected."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    { "command": "npm run type-check", "result": "passed", "summary": "tsc -b --noEmit clean" },
    { "command": "npm run lint", "result": "passed", "summary": "eslint --max-warnings 0 clean" },
    { "command": "npm test -- --run", "result": "passed", "summary": "60 files / 491 tests pass" },
    { "command": "npm audit (server, prod)", "result": "passed", "summary": "0 vulnerabilities" }
  ],
  "validationOutput": [
    "Baseline GREEN: type-check clean, lint clean (max-warnings 0), 491/491 tests pass, 0 audit vulns.",
    "Note: server *.test.js run via ROOT vitest config; `cd server && vitest` fails only on a root-relative setup path (invocation artifact, not a defect)."
  ],
  "residualRisks": [
    "PERF-01 fix that adds /api/videos pagination changes the client data contract — coordinate client+server in one change.",
    "DEPS-01 axios→fetch consolidation touches feed-fetcher.js + shorts-status.js on the critical refresh path; error/timeout parity must be preserved per call site."
  ],
  "noStagedFiles": true,
  "diffSummary": "No code changes — review-only audit. Only artifact written: .pi-subagents/artifacts/progress/1139cffd/progress.md (findings summary, untracked).",
  "reviewFindings": [
    "PERF-01 (HIGH): full <=5000-video payload re-fetched every 5-30s; server ETag/304 never triggered by client (no If-None-Match); no response compression; /api/videos unbounded — app-factory.js:405-430, useRSSVideos.ts:104-128",
    "DEBT-01 (MED): ~180 lines dead code in channel-search.js (searchPiped/Invidious/YouTubePage + unused resolveDirectChannel + dead PIPED/INVIDIOUS config) — channel-search.js:362-479,607-715",
    "DEBT-02 (MED): impl in llm-channel-resolver.js but 1015-line test suite under 1-line opencode-channel-resolver.js shim; deprecated aliases unused — opencode-channel-resolver.js / opencode-channel-resolver.test.js",
    "DEPS-01 (MED): duplicate outbound HTTP client (axios + global fetch) in server — app-factory.js:513, feed-fetcher.js:265,477, shorts-status.js, subscription-resolver.js vs fetch elsewhere",
    "DEBT-03 (LOW): VirtualizedVideoGrid handleVideoUnavailable not memoized -> all VideoCards re-render on grid re-render — VirtualizedVideoGrid.tsx:66-76,213",
    "DEPS-02 (LOW/note): Express 4.22.2 / zustand 4.5.7 lag; neither EOL -> optional, not recommended"
  ],
  "manualNotes": "Read-only audit; no fixes applied per task constraint ('findings ONLY'). Progress summary written to the requested progress path. Highest-leverage item by far is PERF-01 (ETag 304 + gzip are cheap, high-impact wins; pagination is the bigger M-effort follow-up). DEBT-01/DEBT-02 are quick S-effort cleanups. No blockers."
}
```

**Bottom line, wee man:** the codebase is genuinely tidy — clean layering, proper transaction batching, all deps current, tests green. The one thing actually costing you is the **video payload getting re-pulled wholesale every few seconds with the ETag sitting there unused**. Fix the 304 + add gzip first (cheap, huge bytes win), then prune the dead resolver code. The rest is housekeeping. 🍀