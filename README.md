# YouTube RSS Subscriptions

YouTube's subscription feed is algorithmically curated and can hide videos. FreshRSS reads feeds but does not understand YouTube. YouTube RSS Subscriptions is a YouTube-native feed reader that tracks watched state, filters Shorts, queues videos for later, and stays RSS-first so routine refreshes do not burn YouTube API quota.

It is a feed reader, not a video archive. Videos still play through YouTube, so deleted, private, age-restricted, or region-blocked videos may become unavailable.

## Why This Exists

YouTube already has subscriptions, but the feed is not a clean chronological inbox. General RSS readers solve chronology, but miss YouTube-specific workflow: watched state, Shorts detection, duration filters, channel health, embedded playback, favorites, and a watch-later queue.

This app sits in the middle: self-hosted, chronological, YouTube-aware, and deliberately not recommendation-driven.

## Quick Start

### Docker

```bash
export SERVER_API_TOKEN="$(openssl rand -hex 32)"
docker compose up -d
```

The included compose file runs `ghcr.io/greg-hass/youtube-subscriptions:latest`, serves the app on `http://localhost:5173`, and stores user data in `./server/data`. After the first start, open Settings and save the same Server API Token in that browser.

### Local Development

```bash
npm install
cd server && npm install && cd ..
npm run dev
```

In another terminal:

```bash
cd server
SERVER_API_TOKEN=replace_with_a_long_random_token npm run dev
```

For an intentionally unauthenticated local API during development:

```bash
cd server
ALLOW_INSECURE_UNAUTHENTICATED_API=true npm run dev
```

With token protection enabled, save the same token under Settings in each browser that should use the app.

The frontend runs at `http://localhost:5173`.

## What It Does

- Builds a chronological feed from YouTube RSS feeds by default
- Keeps subscriptions, watched videos, favorites, queue, filters, and settings under your control
- Imports OPML and Google Takeout subscription exports
- Finds channels by search without requiring the YouTube Data API
- Refreshes feeds in the background and shows refresh health in the UI
- Tracks failed channels, retries manually, and backs off repeated RSS failures
- Filters by duration, Shorts, live replays, premieres, muted keywords, and boosted keywords
- Resumes embedded playback position for videos you have started
- Supports dark/light theme, mobile layouts, swipe actions, and PWA install
- Uses SQLite for server state and includes tested backup and restore commands

## Screenshots

Screenshots and GIFs should show the product in use, not an empty install. See [docs/screenshots/README.md](docs/screenshots/README.md) for the capture checklist.

Suggested first set:

- Main feed with mixed channels, durations, queue/favorite controls, and refresh status
- Mobile swipe-to-watch interaction
- Settings data safety and backup/restore section
- Failed channel health state with retry

## How It Compares

| Capability | YouTube RSS Subscriptions | FreshRSS/Miniflux | YouTube Native |
| --- | --- | --- | --- |
| Chronological subscriptions | Yes | Yes | Not reliably |
| YouTube watched state | Yes | No | Yes |
| Shorts filtering | Yes | No | Limited |
| Queue/favorites | Yes | Generic only | Algorithm-coupled |
| Duration and replay filters | Yes | No | Limited |
| RSS-first/no routine API quota | Yes | Yes | No |
| Self-hosted data | Yes | Yes | No |
| Embedded YouTube playback | Yes | Link-out centric | Yes |

## Data Safety

The server stores runtime application data in SQLite:

- `server/data/youtube-subscriptions.sqlite` for subscriptions, settings, watched state, feed cache metadata, channel refresh state, and subscription deletion tombstones

Existing `server/data/db.json` and `server/data/videos.json` files are imported once during the SQLite migration and left in place as legacy recovery material. JSON writes used temporary-file replacement and rotating backups before the migration.

Create a validated SQLite backup from the server folder:

```bash
cd server
npm run backup:sqlite
```

The backup command uses SQLite's backup API, so it can snapshot the WAL-backed database while the server is running. It writes timestamped `.backup.sqlite` files under `server/data/backups` unless `--file`, `--dir`, or `SQLITE_DATABASE_FILE` selects another path.

Restore while the server is stopped:

```bash
cd server
npm run restore:sqlite -- --file data/backups/youtube-subscriptions.YYYY-MM-DDTHH-MM-SS.sssZ.backup.sqlite
```

Restore validates the backup before replacement, writes a `*.pre-restore.sqlite` recovery snapshot of the current database, and removes old SQLite WAL sidecars before the restored database is activated.

The Settings screen includes a full app backup export for subscriptions, watched videos, favorites, queue, feed filters, groups, and settings.

This is intended for a personal, self-hosted deployment. SQLite improves integrity and queryability for one app instance; it is not a multi-user authorization model.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | unset | Optional server-only key for capped background handle/custom URL resolution |
| `FEED_REFRESH_ENABLED` | `true` | Enables scheduled background feed refreshes |
| `FEED_REFRESH_ON_START` | `true` | Refreshes on server startup when the cache is stale |
| `FEED_REFRESH_INTERVAL_MINUTES` | `15` | Scheduled refresh interval |
| `SERVER_API_TOKEN` | unset | Bearer token required by default for all `/api/*` requests except `/api/healthz` |
| `ALLOW_INSECURE_UNAUTHENTICATED_API` | `false` | Explicit opt-out for trusted local deployments without a server API token |
| `ALLOWED_ORIGINS` | unset | Optional comma-separated browser origin allowlist, for example `https://feeds.example.com` |
| `API_WRITE_RATE_LIMIT_WINDOW_MS` | `60000` | Window for mutating API request rate limits |
| `API_WRITE_RATE_LIMIT_MAX` | `30` | Maximum mutating API requests per client within the rate-limit window |

When `SERVER_API_TOKEN` is unset, the API fails closed unless `ALLOW_INSECURE_UNAUTHENTICATED_API=true` is explicitly set. For anything reachable beyond the local machine, keep the token requirement, put the app behind HTTPS, and save the same value under Server API Token in each browser so the app can send `Authorization: Bearer <token>` to same-origin API requests.

## Optional YouTube API Key

An API key is optional. The app only uses it as a capped fallback for resolving channel handles/custom URLs to canonical channel IDs. Routine video refreshes stay RSS-first.

If you want the server refresh worker to use the fallback:

1. Create a key in the Google Cloud Console.
2. Enable YouTube Data API v3 for that key.
3. Set `YOUTUBE_API_KEY` on the server.

The Settings field is still available for browser-only channel actions. Browser keys are not included in app backups or `/api/sync`.

OAuth is not required.

## Development

```bash
npm run dev
npm run build
npm run test
npm run lint
```

Server:

```bash
cd server
npm run dev
```

## Troubleshooting

### No videos appear

- Confirm subscriptions have been imported or added.
- Check the refresh status panel for current progress or failed channels.
- Trigger a manual refresh from the app.
- Check server logs for RSS fetch failures or channel ID redirects.

### A channel handle does not resolve

- Add the channel by canonical `UC...` channel ID when possible.
- Optionally add a YouTube Data API key in settings for capped handle resolution.

### A video will not play

The app embeds YouTube playback. If YouTube removes, blocks, age-restricts, or region-blocks a video, the cached feed entry may remain but playback can still fail.

## Contributing

Contributions are welcome. Keep changes focused, include tests for behavior changes, and preserve the RSS-first default.

## License

MIT
