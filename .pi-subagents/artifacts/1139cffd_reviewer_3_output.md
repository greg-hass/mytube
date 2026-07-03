Right — audit done, findings filed to the shared progress scratch file alongside the sibling reviewers (no source touched). Here's the verdict.

## Review — TEST / DX / DOCS / DIRECTION

### ✅ Correct (already solid, with evidence)
- **Sync critical path IS well covered.** `server/app-factory.test.js:151–295` integration-tests the optimistic-concurrency flow end-to-end: ETag/revision, matching + stale `If-Match` → 412, malformed/negative → 400, and tombstoning via DELETE + stale-push. The server half of sync is not a risk.
- **channel-search public surface is exercised** (`channel-search.test.js`): identity detection, stopword-filtered query building, dedupe/rank, Feedy HTML discovery before API, API fallback, handle-from-metadata. The new Feedy path is the one thing genuinely tested.
- **Baseline green:** `type-check` clean, `lint` clean, `vitest` 60 files / 491 tests pass. `feed-refresh-policy` has a 19 KB test (heavy coverage on the scheduler maths).

### Findings (leverage-ordered)

#### [TEST-01] Cover the feed-aggregator orchestrator before the Feedy refactor lands
- **Evidence**: `server/feed-aggregator.js` — highest-churn file (60 commits), the feature the repo exists for. `runAggregation` (~L200–380), `aggregateFeeds`, `aggregateOnStartupIfStale`, `startScheduledRefresh` have **no tests**. The lone test `feed-aggregator-internals.test.js` has 2 tests (refreshBatch metadata, setRunningAggregationStatus). The `__test__` export (~L480–490) **doesn't even expose** `runAggregation`/`aggregateFeeds` — the core path is unreachable from tests by design. The Feedy spec's "Aggregator tests cover" section lists 6 required behaviours (bounded concurrency, overlap coalescing, trigger parity, partial failure, incremental status, archive/Shorts preservation): zero present.
- **Impact**: every change to the refresh engine — *including the in-progress Feedy rewrite* — ships blind; quota-reset, redirect-merge, archive-eviction regressions are invisible until prod.
- **Effort**: M · **Risk**: MED (injectable singleton may surface coupling; no public-API change) · **Confidence**: HIGH
- **Fix sketch**: thread a deps object (appStore, feedFetcher, clock) into `createFeedAggregator`, export `runAggregation` under `__test__`, characterization tests for stale-cache skip, overlap join, partial-batch failure.

#### [TEST-02] Client-side sync reconciliation & persistence are untested
- **Evidence**: `src/lib/server-sync.ts` (200 LOC — tombstones L51, `pushToServer` 412 L163, `forcePushToServer` 412 retry L197), `src/lib/sync-reconcile.ts` (282 LOC), `src/lib/indexeddb.ts` (**692 LOC** — largest lib file, the client persistence layer) = **zero tests**. Asymmetry: the *server* half of this exact path is integration-tested, the *client* conflict/merge/tombstone half is not.
- **Impact**: optimistic-concurrency + tombstone deletion reconciliation — the multi-browser data-integrity boundary — regresses silently.
- **Effort**: M · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: unit-test `mergeSubscriptionLists`, `applyServerRedirects`, and the 412→revision-recorder flow with mocked fetch.

#### [TEST-03] shorts-status.js — no tests, central to the feed path
- **Evidence**: no `server/shorts-status.test.js`; called throughout feed-aggregator. Pure/DI-ready fns: `looksLikeShortByLocalMetadata` (regex), `isArchivedShortsBackfillDue(now=Date.now())`, `resolveYouTubeShortsStatus(...,httpClient=axios)`.
- **Impact**: the Shorts filter (a headline feature) rides on regex + duration heuristics with no characterization — one regex tweak silently re-classifies the archive.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: tests for the text/thumbnail/duration heuristics + backfill-due clock; mock httpClient.

#### [TEST-04] /api/resolve-channel public route is untested
- **Evidence**: `server/app-factory.js:490–532` — documented public API (named in the Feedy spec's API-compatibility contracts). `grep -rl "resolve-channel" server/` → only the route file itself, no test. Carries real validation (type/value, 256-char cap, regex `^[\w.@\-/]+$`, handle vs custom_url, 503/404 mapping).
- **Impact**: the "add by handle/URL" path's validation/error mapping can regress with no signal.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: supertest cases for invalid input, handle/custom_url success (mock axios), 404 no-channelId, 503 disabled.

#### [DX-01] .env.example omits the documented feed-refresh env vars
- **Evidence**: README "Configuration" + docker-compose.yml set `FEED_REFRESH_ENABLED`, `FEED_REFRESH_ON_START`, `FEED_REFRESH_INTERVAL_MINUTES`. `.env.example` lists rate-limit/origins/auth vars but **none** of the feed-refresh trio.
- **Impact**: operators must read README/compose, not the file they're told to copy.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: add the three vars (commented, with defaults).

#### [DOC-01] Project AGENTS.md has drifted from the renamed codebase
- **Evidence**: `AGENTS.md:17` image `ghcr.io/greg-hass/youtube-subscriptions:latest` vs actual `…/mytube:latest`. Env table `FEED_REFRESH_INTERVAL_MINUTES` default **15** vs code default **5** (`feed-refresh-policy.js:2`; compose; README all say 5). Architecture Notes DB `youtube-subscriptions.sqlite` vs primary `mytube.sqlite` (`app-store.js:8–9`). Omits `FEED_REFRESH_ON_START`.
- **Impact**: AGENTS.md is the **binding** process doc agents follow — wrong image name + wrong DB path directly mislead agent-driven deploys/edits.
- **Effort**: S · **Risk**: LOW · **Confidence**: HIGH
- **Fix sketch**: update image, interval, primary DB path; add `FEED_REFRESH_ON_START`.

#### [DIR-01] Finish or descope the multi-resolver removal the Feedy spec mandates
- **Evidence**: `docs/…/2026-07-03-feedy-youtube-refresh-discovery-design.md` "Removal scope" says remove Brave/LLM/OpenCode/Piped/Invidious. `channel-search.js` still wires them in: `resolveChannelViaLlm` (import L14, used L614), `PIPED_INSTANCES` (L368), `INVIDIOUS_INSTANCES` (L414), `parseYouTubeUrl` from brave-channel-search (L7/647). `llm-channel-resolver.js` (26 KB) + `brave-channel-search.js` remain; `opencode-channel-resolver.js` is an 8-line shim carrying a 26 KB mis-named test. Blast radius untouched: `nginx.conf` CSP still lists ~12 piped/invidious origins; `.env.example` still documents `BRAVE_API_KEY`+`OPENCODE_API_KEY`; `external-services.json` still ships piped/invidious lists.
- **Impact (product value)**: delivers the spec's payoff — operational clarity, ONE RSS/HTML/API path instead of five flaky third-party tiers that rot constantly; also kills the 26 KB LLM resolver + its key-handling surface.
- **Effort**: L · **Risk**: MED (keep YouTube-API fallback + public contracts) · **Confidence**: HIGH that it's intended-but-undelivered (spec dated today, in progress); finish-vs-keep is the maintainer's call.
- **Fix sketch**: design/finish plan — delete the four modules + call sites, strip piped/invidious from CSP + external-services.json + .env.example, inline/rename the opencode test, confirm Feedy + API fallback stay green.

#### [DX-02] No type checking on the JS server (note, not a must)
- **Evidence**: `server/package.json` has no `type-check`; server is plain CommonJS. Root `eslint.config.js` **does** lint `server/**/*.js` and CI runs it — so lint is covered, but type drift in sqlite-store/channel-search/feed-aggregator JS is invisible. `tsc --allowJs --checkJs` absent.
- **Impact**: shape drift between sqlite-store JSON blobs and consumers won't surface at build.
- **Effort**: M · **Risk**: MED (first pass flags a lot) · **Confidence**: HIGH it's absent, MED it's worth doing now (deliberate JS choice; integration tests mitigate). Reported as an option.

---

**Two residual risks worth naming:** (1) sibling reviewers are concurrently clobbering the shared `progress.md` — I appended rather than overwrote, but the file is a race zone; (2) DIR-01 overlaps the PERF/DEBT reviewer's DEBT-01/DEBT-02 (dead Piped/Invidious code + opencode shim) — same root cause, different lens.