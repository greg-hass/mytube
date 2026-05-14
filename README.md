# YouTube RSS Subscriptions

YouTube's subscription feed is algorithmically curated and can hide videos. FreshRSS reads feeds but does not understand YouTube. YouTube RSS Subscriptions is a YouTube-native feed reader that tracks watched state, filters Shorts, queues videos for later, and stays RSS-first so routine refreshes do not burn YouTube API quota.

It is a feed reader, not a video archive. Videos still play through YouTube, so deleted, private, age-restricted, or region-blocked videos may become unavailable.

## Why This Exists

YouTube already has subscriptions, but the feed is not a clean chronological inbox. General RSS readers solve chronology, but miss YouTube-specific workflow: watched state, Shorts detection, duration filters, channel health, embedded playback, favorites, and a watch-later queue.

This app sits in the middle: self-hosted, chronological, YouTube-aware, and deliberately not recommendation-driven.

## Quick Start

### Docker

```bash
docker compose up -d
```

The included compose file runs `ghcr.io/greg-hass/youtube-subscriptions:latest`, serves the app on `http://localhost:5173`, and stores user data in `./server/data`.

### Local Development

```bash
npm install
cd server && npm install && cd ..
npm run dev
```

In another terminal:

```bash
cd server
npm run dev
```

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
- Writes JSON data atomically, keeps rotating backups, and recovers from corrupt startup data when a valid backup exists

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

The server stores application data as JSON files:

- `server/data/db.json` for subscriptions, settings, watched state, redirects, and related user data
- `server/data/videos.json` for cached feed metadata, Shorts metadata, and refresh state

Writes use a temporary file followed by rename, and existing JSON files are backed up before replacement. On startup, the server validates data files and restores the newest valid backup if the primary file is corrupt.

The Settings screen includes a full app backup export for subscriptions, watched videos, favorites, queue, feed filters, groups, and settings.

This is intended for a personal, self-hosted deployment. If you want multiple users, stronger querying, or heavier concurrency, SQLite would be the next natural storage step.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `FEED_REFRESH_ENABLED` | `true` | Enables scheduled background feed refreshes |
| `FEED_REFRESH_ON_START` | `true` | Refreshes on server startup when the cache is stale |
| `FEED_REFRESH_INTERVAL_MINUTES` | `15` | Scheduled refresh interval |

## Optional YouTube API Key

An API key is optional. The app only uses it as a capped fallback for resolving channel handles/custom URLs to canonical channel IDs. Routine video refreshes stay RSS-first.

If you want the fallback:

1. Create a key in the Google Cloud Console.
2. Enable YouTube Data API v3 for that key.
3. Add the key in the app settings.

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
