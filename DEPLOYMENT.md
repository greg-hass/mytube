# Docker Deployment

The production image contains both parts of the app:

- nginx serves the built PWA
- Node runs the API and RSS feed cache
- nginx proxies `/api` to Node inside the same container

## GitHub Container Registry Image

```text
ghcr.io/greg-hass/youtube-subscriptions:latest
```

The GitHub Actions workflow publishes this image on pushes to `main`.

## Ubuntu Server

Create a folder for the stack:

```bash
mkdir -p ~/youtube-subscriptions
cd ~/youtube-subscriptions
```

Create `docker-compose.yml`:

```yaml
services:
  youtube-subscriptions:
    image: ghcr.io/greg-hass/youtube-subscriptions:latest
    container_name: youtube-subscriptions
    ports:
      - "5173:8080"
    volumes:
      - youtube-subscriptions-data:/app/server/data
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - SERVER_API_TOKEN=${SERVER_API_TOKEN:?Set SERVER_API_TOKEN to a long random value}
      - YOUTUBE_API_KEY=${YOUTUBE_API_KEY:-}
      - FEED_REFRESH_ENABLED=true
      - FEED_REFRESH_INTERVAL_MINUTES=15
      - FEED_REFRESH_ON_START=true
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/api/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

volumes:
  youtube-subscriptions-data:
```

Start it:

```bash
export SERVER_API_TOKEN="$(openssl rand -hex 32)"
docker compose pull
docker compose up -d
```

Open Settings after first start and save that Server API Token in each browser that should use the app.

Open:

```text
http://your-server-ip:5173
```

## If The GHCR Package Is Private

Create a GitHub token with package read access, then:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
docker compose pull
docker compose up -d
```

## Updating

```bash
cd ~/youtube-subscriptions
docker compose pull
docker compose up -d
docker image prune -f
```

## Logs And Health

```bash
docker compose logs -f
docker ps
curl http://localhost:5173/api/videos/status
```

The status response includes `scheduledRefresh.nextRunAt`, so you can confirm the background refresh loop is active.

## Scheduled Refresh

The container keeps the feed warm automatically.

- `FEED_REFRESH_ENABLED=true` enables the background scheduler
- `FEED_REFRESH_INTERVAL_MINUTES=15` refreshes due feeds every 15 minutes
- `FEED_REFRESH_ON_START=true` checks the cache when the container starts

Set `FEED_REFRESH_INTERVAL_MINUTES=30` or `60` if you want a quieter server.

## Backup

The persistent `youtube-subscriptions-data` volume contains the SQLite database with subscriptions, cached videos, watched state, redirects, and deletion tombstones. Legacy JSON files may remain after the one-time SQLite import.

For a live container, create a SQLite snapshot through the app's tested backup command:

```bash
docker compose exec youtube-subscriptions sh -lc 'cd /app/server && npm run backup:sqlite'
```

Copy the resulting `data/backups/*.backup.sqlite` file to your backup target:

```bash
docker compose cp youtube-subscriptions:/app/server/data/backups/your-backup.backup.sqlite .
```

For restore, copy the backup into the volume, stop the app, then run the restore command in a one-off container:

```bash
docker compose cp ./your-backup.backup.sqlite youtube-subscriptions:/app/server/data/backups/your-backup.backup.sqlite
docker compose stop youtube-subscriptions
docker compose run --rm youtube-subscriptions sh -lc 'cd /app/server && npm run restore:sqlite -- --file data/backups/your-backup.backup.sqlite'
docker compose up -d
```

Restore validates the backup and keeps a `data/backups/*.pre-restore.sqlite` recovery snapshot of the database it replaces.

## Host-Path Data

The default named volume preserves the image's non-root write permissions for SQLite. If you replace it with a bind mount such as `./data:/app/server/data`, create the host directory first and make it writable by container UID `1000` before starting the stack:

```bash
mkdir -p data
sudo chown -R 1000:1000 data
```

If a bind-mounted stack exits with `SQLITE_CANTOPEN`, fix that directory ownership and restart it. Do not run the app container as root just to work around a data directory permission problem.

Keep the bind mount and fix its ownership when it already contains data you need. Switching an existing stack from a bind mount to the named volume creates a separate empty volume until you copy the old database into it.
