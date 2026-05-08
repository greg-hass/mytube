# Dockge Deployment

This app is published as a single GitHub Container Registry image:

```text
ghcr.io/greg-hass/youtube-subscriptions:latest
```

## Dockge Stack

Create a new stack named `youtube-subscriptions` and use:

```yaml
services:
  youtube-subscriptions:
    image: ghcr.io/greg-hass/youtube-subscriptions:latest
    container_name: youtube-subscriptions
    ports:
      - "3000:80"
    volumes:
      - ./data:/app/server/data
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3001
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost/api/videos/status"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
```

Open:

```text
http://your-server-ip:3000
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
- Persistent subscriptions, videos, watched state, and redirects live in `./data`.
- If the package is private in GitHub Container Registry, log in first:

```bash
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```
