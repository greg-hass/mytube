# Feedy YouTube Refresh and Discovery Integration

## Objective

Replace MyTube's current YouTube channel discovery and feed refresh mechanisms
with the reliable RSS-first behavior proven in Feedy, adapted to MyTube's
single-container Express and SQLite architecture.

The integration must preserve MyTube's existing public API routes, frontend
payloads, persisted subscriptions, cached videos, watched state, favorites,
queue, Shorts metadata, and Docker topology. YouTube Data API remains the only
fallback. Brave, LLM, OpenCode, Piped, Invidious, and uploads-page scraping are
removed from these workflows.

## Constraints

- Keep Express, SQLite WAL mode, and the existing background scheduler.
- Do not introduce PostgreSQL, Redis, BullMQ, or another worker service.
- Preserve `/api/channel-search`, `/api/resolve-channel`,
  `/api/videos/refresh`, `/api/videos/status`, and `/api/videos`.
- Keep stored subscription and video-cache data backward compatible.
- Use YouTube RSS as the primary video source.
- Use `YOUTUBE_API_KEY` only after RSS or HTML discovery cannot produce a
  usable result, and retain quota caps.
- Never delete cached videos because an upstream refresh fails.

## Architecture

### Channel discovery

`server/channel-search.js` remains the API-facing coordinator but delegates to
focused YouTube discovery functions adapted from Feedy.

The discovery pipeline:

1. Classifies direct channel IDs, YouTube RSS URLs, `/channel/...` URLs, and
   `@handle` inputs before treating input as a keyword.
2. Normalizes direct inputs and resolves channel pages through YouTube HTML
   metadata.
3. For keywords, requests YouTube's channel-only results page, extracts
   `ytInitialData`, walks `channelRenderer` nodes, and returns canonical
   candidates.
4. Ranks candidates against normalized query tokens and identities, then
   deduplicates by channel ID, handle, and normalized title.
5. Invokes the YouTube Data API only when primary discovery fails or produces
   no usable candidates and an API key is configured.
6. Maps results into MyTube's existing channel-search response shape.

Selected results must resolve to a valid canonical `UC...` channel ID before
they can be persisted. Their feed URL is always derived as
`https://www.youtube.com/feeds/videos.xml?channel_id=<channelId>`.

The replacement removes Brave Search, LLM providers, OpenCode, Piped, and
Invidious from the discovery path. Their settings controls, environment
configuration, status reporting, and obsolete implementation modules are
removed when no unrelated consumer remains.

### Feed fetching

`server/feed-fetcher.js` becomes an RSS-first fetcher based on Feedy's YouTube
feed behavior while retaining MyTube's video model.

For each canonical channel:

1. Build and validate the canonical YouTube RSS URL.
2. Fetch with an explicit timeout and conditional request metadata when the
   upstream supports it.
3. Parse YouTube-specific RSS fields and normalize videos into MyTube's
   existing cache representation.
4. Deduplicate items by video ID and calculate a deterministic hash from the
   ordered item IDs.
5. Return `not-modified` when the response is HTTP 304 or the item hash matches
   the previously stored hash.
6. On RSS failure, invoke the capped YouTube Data API fallback if configured.
7. Otherwise return a classified failure without replacing cached videos.

The uploads-playlist HTML scraping fallback is removed. Existing local Shorts
classification, thumbnail normalization, archive merging, and metadata
preservation remain downstream of the normalized fetch result.

### Refresh orchestration

`server/feed-aggregator.js` keeps responsibility for startup, scheduled, and
manual refreshes. All triggers use one orchestration path.

The orchestrator:

- selects channels due for refresh using existing per-channel state;
- processes a bounded number of channels concurrently;
- prevents or coalesces overlapping whole-library refreshes;
- records per-channel `success`, `not-modified`, `transient-failure`, or
  `permanent-failure` outcomes;
- merges successful videos without dropping archived entries;
- preserves the prior cache for failed channels;
- updates progress incrementally and exposes useful failure summaries;
- schedules transient failures for a later attempt without immediate retry
  storms.

An active manual refresh request returns or observes the active operation
rather than starting a competing aggregation.

## Persistence

Existing SQLite application and video-cache records remain authoritative.
No destructive migration is allowed.

If current channel refresh metadata can hold the item hash and failure
classification, those fields are added to its JSON-compatible representation.
If a schema change is unavoidable, it must be additive, tolerate old rows, and
preserve rollback compatibility.

At minimum, refresh metadata records:

- last attempted refresh;
- last successful refresh;
- last item hash;
- latest outcome classification;
- latest error summary;
- consecutive transient failure count.

## API compatibility

The following contracts remain available:

- `GET /api/channel-search?q=...`
- `POST /api/resolve-channel`
- `POST /api/videos/refresh`
- `GET /api/videos/status`
- `GET /api/videos`

Existing fields are retained. `/api/videos/status` may add per-channel outcome
details and aggregate counts. Additive fields must not require simultaneous
frontend deployment.

## Error handling

Permanent failures include malformed or unsupported channel identities and
confirmed missing channels. Transient failures include network timeouts,
connection failures, HTTP 408/429, and retryable upstream 5xx responses.

The primary RSS fetch does not perform an internal retry loop that can amplify
a scheduled batch. Retry timing belongs to the scheduler. The API fallback is
attempted once per due refresh and remains subject to the existing quota cap.

Errors are logged once at the refresh boundary with channel identity, source,
classification, and status. Secrets and API keys are never logged.

## User experience

The existing Add Channel modal remains the user-facing surface. Search results
load from Feedy-style discovery but keep MyTube's result cards and add flow.
Direct URLs and handles continue to work.

Failure messages distinguish:

- no matching YouTube channels;
- YouTube discovery temporarily unavailable;
- invalid channel input;
- API fallback unavailable or quota-limited.

Refresh status continues to appear through the existing header/settings
surfaces, with additive outcome detail where useful. The integration does not
redesign unrelated UI.

## Removal scope

Remove discovery and refresh code, tests, settings, environment documentation,
and configuration for:

- Brave channel search;
- LLM and DeepSeek discovery;
- OpenCode discovery;
- Piped and Invidious discovery;
- uploads-playlist HTML refresh fallback.

Retain YouTube Data API configuration and quota controls. Do not remove a
module if it still has an unrelated runtime consumer; instead remove only the
obsolete path and document the remaining use.

## Testing

Implementation follows test-driven development.

Discovery tests cover:

- balanced extraction and parsing of `ytInitialData`;
- channel renderer extraction;
- handle and channel-ID normalization;
- ranking and deduplication;
- malformed and empty responses;
- direct URL and handle resolution;
- API fallback only after primary discovery fails or returns no candidates;
- compatibility of API response payloads.

Feed tests cover:

- canonical feed target validation;
- YouTube RSS parsing and normalization;
- deterministic item hashes;
- HTTP 304 and matching-hash no-change outcomes;
- timeout and HTTP failure classification;
- API fallback boundaries and quota behavior;
- preservation of cache data on failure.

Aggregator tests cover:

- bounded concurrency;
- refresh overlap coalescing;
- startup, scheduled, and manual trigger parity;
- partial failure handling;
- incremental status reporting;
- archive, watched, queue, favorite, and Shorts metadata preservation.

Final verification includes:

- `npm run lint`
- `npm run type-check`
- `npm run test -- --run`
- `npm run build`
- live health and authenticated API checks;
- one direct channel discovery and one keyword discovery;
- one manual refresh with status inspection;
- desktop and mobile Add Channel smoke tests;
- `docker compose config`, build, startup, health, and logs when Docker is
  available.

## Risks and mitigations

YouTube HTML structures can change. Parsing is isolated, fixture-tested, and
fails into the capped API fallback. RSS outages must not erase cached content.
Bounded concurrency and scheduler-owned retries avoid upstream request storms.

Removing multiple fallback providers reduces breadth but deliberately improves
operational clarity. The retained YouTube API fallback provides a controlled
escape hatch without making normal operation quota-dependent.
