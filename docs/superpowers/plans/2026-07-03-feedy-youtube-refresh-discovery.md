# Feedy YouTube Refresh and Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MyTube's multi-provider discovery and HTML refresh fallbacks with Feedy-style YouTube discovery and RSS refresh behavior, retaining the capped YouTube API as the only fallback.

**Architecture:** Keep Express, SQLite, the current cache, and the current scheduler. Isolate YouTube HTML discovery and RSS outcome logic in focused CommonJS modules, then adapt the existing channel-search and feed-aggregator contracts so the frontend and persistent data remain compatible.

**Tech Stack:** Node.js, Express, SQLite, rss-parser, axios/fetch, Vitest, React 19, TypeScript

---

### Task 1: Feedy-style YouTube discovery parser

**Files:**
- Create: `server/youtube-discovery.js`
- Create: `server/youtube-discovery.test.js`

- [ ] **Step 1: Write failing parser tests**

Test balanced `ytInitialData` extraction, `channelRenderer` traversal, handle and
thumbnail normalization, canonical RSS URL construction, malformed HTML, and
deduplication by channel ID.

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test -- --run server/youtube-discovery.test.js`

Expected: FAIL because `youtube-discovery.js` does not exist.

- [ ] **Step 3: Implement the parser**

Implement pure helpers:

```js
extractYouTubeInitialData(html)
findYouTubeChannelCandidates(payload)
normalizeChannelCandidate(candidate)
dedupeChannelCandidates(candidates)
buildYouTubeFeedUrl(channelId)
```

Use balanced JSON extraction instead of a non-greedy regex so nested renderer
payloads parse reliably.

- [ ] **Step 4: Verify the parser tests pass**

Run: `npm run test -- --run server/youtube-discovery.test.js`

Expected: PASS.

### Task 2: Replace channel search coordination

**Files:**
- Modify: `server/channel-search.js`
- Modify: `server/channel-search.test.js`
- Modify: `server/app-factory.js`
- Modify: `server/app-factory.test.js`

- [ ] **Step 1: Add failing coordinator tests**

Cover direct ID/handle/page resolution, keyword channel-only YouTube search,
ranking, deduplication, primary discovery before API fallback, API fallback on
empty/error, and no fallback call when primary discovery succeeds.

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test -- --run server/channel-search.test.js server/app-factory.test.js`

Expected: FAIL because current tiers invoke LLM/Brave/API before the required
Feedy-style pipeline.

- [ ] **Step 3: Implement the replacement**

Reduce `searchChannels()` to:

```js
direct input -> YouTube HTML metadata
keyword -> channel-only YouTube results + ytInitialData parser
empty/error -> searchYouTubeApiChannels()
rank + dedupe -> existing result shape
```

Remove Brave, LLM, OpenCode, Piped, and Invidious parameters from
`/api/channel-search`. Pass `process.env.YOUTUBE_API_KEY` only to the fallback.

- [ ] **Step 4: Verify search and API tests pass**

Run: `npm run test -- --run server/channel-search.test.js server/app-factory.test.js`

Expected: PASS.

### Task 3: Add RSS refresh outcomes and API fallback

**Files:**
- Modify: `server/feed-fetcher.js`
- Modify: `server/feed-fetcher.test.js`
- Modify: `server/youtube-api-search.js`
- Modify: `server/youtube-api-search.test.js`

- [ ] **Step 1: Write failing refresh tests**

Cover canonical feed URLs, normalized RSS items, deterministic ordered video-ID
hashes, matching-hash `not-modified`, transient/permanent error classification,
single API fallback invocation, and no uploads-page HTML request.

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test -- --run server/feed-fetcher.test.js server/youtube-api-search.test.js`

Expected: FAIL because the current fetcher retries internally and uses the
uploads-playlist HTML fallback.

- [ ] **Step 3: Implement RSS-first fetch results**

Return an explicit result:

```js
{
  outcome: "success" | "not-modified" | "transient-failure" | "permanent-failure",
  videos,
  itemHash,
  source: "rss" | "youtube-api",
  error: null | string
}
```

Perform one bounded RSS request. Compare the deterministic item hash with the
stored hash. Invoke the existing capped YouTube API only after RSS failure.

- [ ] **Step 4: Verify fetcher tests pass**

Run: `npm run test -- --run server/feed-fetcher.test.js server/youtube-api-search.test.js`

Expected: PASS.

### Task 4: Integrate outcomes into aggregation and status

**Files:**
- Modify: `server/feed-aggregator.js`
- Modify: `server/feed-aggregator-internals.test.js`
- Modify: `server/feed-refresh-policy.test.js`
- Modify: `server/app-factory.js`
- Modify: `server/app-factory.test.js`

- [ ] **Step 1: Write failing orchestration tests**

Cover bounded batches, active refresh coalescing without a second forced run,
no-change results, cache preservation on partial failure, additive outcome
counts, stored item hashes, and startup/manual/scheduled use of the same path.

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test -- --run server/feed-aggregator-internals.test.js server/feed-refresh-policy.test.js server/app-factory.test.js`

Expected: FAIL because current overlap handling queues a follow-up run and
refresh metadata lacks outcome/hash fields.

- [ ] **Step 3: Implement outcome persistence**

Store additive per-channel metadata:

```js
{
  lastAttemptedAt,
  lastRefreshedAt,
  itemHash,
  outcome,
  lastError,
  consecutiveFailures
}
```

Merge videos only for successful outcomes, treat no-change as successful, and
preserve archived videos for every failure. Add outcome counts to
`/api/videos/status` without removing existing fields.

- [ ] **Step 4: Verify orchestration tests pass**

Run: `npm run test -- --run server/feed-aggregator-internals.test.js server/feed-refresh-policy.test.js server/app-factory.test.js`

Expected: PASS.

### Task 5: Remove obsolete discovery configuration and UI

**Files:**
- Modify: `src/components/SettingsModalSections.tsx`
- Modify: `src/components/SettingsModal.test.tsx`
- Modify: `src/hooks/useAddChannelSearch.ts`
- Modify: `src/hooks/useChannelSuggestions.ts`
- Modify: `src/hooks/useSettingsFormState.ts`
- Modify: `src/hooks/useSettingsState.ts`
- Modify: `src/store/createDataSlice.ts`
- Modify: `src/types/youtube.ts`
- Modify: `docker-compose.yml`
- Modify: `README.md` only around obsolete provider documentation, preserving unrelated user changes
- Delete when unreferenced: `server/brave-channel-search.js`
- Delete when unreferenced: `server/brave-channel-search.test.js`
- Delete when unreferenced: `server/llm-channel-resolver.js`
- Delete when unreferenced: `server/opencode-channel-resolver.js`
- Delete when unreferenced: `server/opencode-channel-resolver.test.js`

- [ ] **Step 1: Update failing UI/config tests**

Assert that only the YouTube API fallback setting remains and channel search no
longer sends provider-specific headers.

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test -- --run src/components/SettingsModal.test.tsx src/components/AddChannelModal.test.tsx`

Expected: FAIL while obsolete controls and headers still exist.

- [ ] **Step 3: Remove obsolete wiring**

Remove Brave/LLM/OpenCode/DeepSeek settings, headers, environment variables,
backend status, and modules after confirming they have no remaining consumer.
Keep `YOUTUBE_API_KEY` and quota controls.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm run test -- --run src/components/SettingsModal.test.tsx src/components/AddChannelModal.test.tsx`

Expected: PASS.

### Task 6: Full verification and rendered QA

**Files:**
- No committed test artifacts

- [ ] **Step 1: Run repository checks**

```bash
npm run lint
npm run type-check
npm run test -- --run
npm run build
```

Expected: all checks pass with zero lint warnings.

- [ ] **Step 2: Validate configuration**

Run: `docker compose config` when Docker is available.

Expected: valid configuration.

- [ ] **Step 3: Run live API smoke checks**

Start server and frontend with a temporary local API token. Verify health,
direct channel discovery, keyword discovery, manual refresh, and refresh status.

- [ ] **Step 4: Run rendered desktop/mobile QA**

Verify Add Channel search, result selection, loading/error states, refresh
feedback, console health, and responsive layout using the in-app browser.
