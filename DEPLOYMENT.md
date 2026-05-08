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
      - "5173:80"
    volumes:
      - ./data:/app/server/data
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
      - FEED_REFRESH_ENABLED=true
      - FEED_REFRESH_INTERVAL_MINUTES=15
      - FEED_REFRESH_ON_START=true
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost/api/videos/status"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

Start it:

```bash
docker compose pull
docker compose up -d
```

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

Back up the `data` directory. It contains subscriptions, cached videos, watched state, and redirects.
