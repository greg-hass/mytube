# Dockge Deployment

This app is published as a single GitHub Container Registry image:

```text
ghcr.io/greg-hass/mytube:latest
```

## Dockge Stack

Create a new stack named `mytube` and use:

```yaml
services:
  mytube:
    image: ghcr.io/greg-hass/mytube:latest
    container_name: mytube
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
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

volumes:
  youtube-subscriptions-data:
```

Open:

```text
http://your-server-ip:5173
```

## Updating

After GitHub Actions publishes a new image:

```bash
docker compose pull
docker compose up -d
```

## Notes

- The app and API run in the same container.
- `/api` is proxied internally from nginx to Node.
- The API fails closed until `SERVER_API_TOKEN` is set. Save that same token in Settings for each browser.
- The server refreshes due RSS feeds every 15 minutes by default.
- Persistent SQLite state for subscriptions, videos, watched state, redirects, and deletion tombstones lives in the `youtube-subscriptions-data` Docker volume.
- Use `npm run backup:sqlite` inside the running container for live SQLite snapshots; stop the stack before `npm run restore:sqlite -- --file ...`.
- A host-path mount such as `./data:/app/server/data` is optional. Create it first and make it writable by container UID `1000` with `mkdir -p data && sudo chown -R 1000:1000 data`; otherwise the non-root container can exit with `SQLITE_CANTOPEN`.
- If an existing bind mount already contains data you need, fix that directory ownership and keep the bind mount until you intentionally migrate it. Replacing it with the named volume starts with a separate volume.
- If the package is private in GitHub Container Registry, log in first:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```
