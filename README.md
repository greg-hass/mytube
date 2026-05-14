# YouTube RSS Subscriptions

A self-hosted, RSS-first feed reader for YouTube subscriptions.

YouTube's subscription feed is algorithmically curated and can hide videos. General RSS readers can read YouTube feeds, but they do not understand YouTube-specific habits like watched state, Shorts filtering, queues, favorites, durations, and embedded playback. This app gives you a chronological YouTube-native feed without relying on YouTube's algorithm or routine API quota.

It is a feed reader, not a video archive. Videos still play through YouTube, so deleted, private, or region-blocked videos may become unavailable.

## What It Does

- Builds the video feed from YouTube RSS feeds by default
- Keeps subscriptions, watched videos, favorites, queue, and settings on your server
- Imports and exports YouTube subscriptions as OPML
- Finds channels by search without requiring the YouTube Data API
- Refreshes feeds in the background and keeps a local video metadata cache warm
- Supports dark/light theme, mobile layouts, swipe actions, and PWA install
- Filters by duration, Shorts, live replays, premieres, muted keywords, and boosted keywords
- Resumes embedded playback position for videos you have started

## What It Is Not

- It does not download or host videos
- It does not replace TubeArchivist, yt-dlp, or a media server
- It does not need a Google login for normal use
- It does not need a YouTube API key for routine RSS video fetching

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS, Framer Motion, lucide-react |
| State/data | React Query, Zustand, TanStack Virtual |
| Server | Express, rss-parser, JSON file storage |
| Deployment | Docker, nginx |

## Quick Start

### Local Development

```bash
npm install
cd server && npm install && cd ..
npm run dev
```

In another terminal, run the API server:

```bash
cd server
npm run dev
```

The frontend runs at `http://localhost:5173`.

### Docker

```bash
docker compose up -d
```

The app stores server data under the Docker volume configured in `docker-compose.yml`.

## Import Subscriptions

1. Export your YouTube subscriptions as OPML.
2. Open the app.
3. Use the import control to upload the OPML file.
4. The server will begin refreshing RSS feeds in the background.

You can also add channels manually from the UI.

## Optional YouTube API Key

An API key is optional. The app only uses it as a capped fallback for resolving channel handles/custom URLs to canonical channel IDs. Routine video refreshes stay RSS-first to avoid draining YouTube Data API quota.

If you want the fallback:

1. Create a key in the Google Cloud Console.
2. Enable YouTube Data API v3 for that key.
3. Add the key in the app settings.

OAuth is not required.

## Server Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `FEED_REFRESH_ENABLED` | `true` | Enables scheduled background feed refreshes |
| `FEED_REFRESH_ON_START` | `true` | Refreshes on server startup when the cache is stale |
| `FEED_REFRESH_INTERVAL_MINUTES` | `15` | Scheduled refresh interval |

## Data Storage

The server stores application data as JSON files:

- `server/data/db.json` for subscriptions, settings, watched state, redirects, and related user data
- `server/data/videos.json` for cached feed metadata and refresh state

This is intended for a personal, self-hosted deployment. If you want multiple users, stronger querying, or heavier concurrency, SQLite would be the next natural storage step.

## Development Commands

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
- Trigger a manual refresh from the app.
- Check the server logs for RSS fetch failures or channel ID redirects.

### A channel handle does not resolve

- Add the channel by canonical `UC...` channel ID when possible.
- Optionally add a YouTube Data API key in settings for capped handle resolution.

### A video will not play

The app embeds YouTube playback. If YouTube removes, blocks, age-restricts, or region-blocks a video, the cached feed entry may remain but playback can still fail.

## Contributing

Contributions are welcome. Keep changes focused, include tests for behavior changes, and preserve the RSS-first default.

## License

MIT
