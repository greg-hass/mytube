# Docker Deployment Guide

## Quick Start

### Option 1: Docker Compose (Recommended)
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

The app will be available at `http://localhost:3000`

### Option 2: Docker CLI
```bash
# Build image
docker build -t youtube-subscriptions .

# Run container
docker run -d -p 3000:80 --name youtube-subscriptions youtube-subscriptions

# View logs
docker logs -f youtube-subscriptions

# Stop
docker stop youtube-subscriptions
docker rm youtube-subscriptions
```

---

## Remote Access

### Option 1: Reverse Proxy (Recommended)
Use a reverse proxy like **Caddy** or **Nginx Proxy Manager** with automatic HTTPS:

**Caddy Example:**
```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Option 2: Cloudflare Tunnel (Free HTTPS)
```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared

# Login
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create youtube-subs

# Configure tunnel
cloudflared tunnel route dns youtube-subs yourdomain.com

# Run tunnel
cloudflared tunnel run youtube-subs
```

### Option 3: Tailscale (Private Access)
```bash
# Install Tailscale on your server
curl -fsSL https://tailscale.com/install.sh | sh

# Connect
sudo tailscale up

# Access via Tailscale IP
http://100.x.x.x:3000
```

---

## Production Deployment

### Environment Variables
Create a `.env` file (optional):
```env
VITE_YOUTUBE_API_KEY=your_api_key_here
```

Then update `docker-compose.yml`:
```yaml
environment:
  - VITE_YOUTUBE_API_KEY=${VITE_YOUTUBE_API_KEY}
```

### Update Container
```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build
```

### Auto-Updates with Watchtower
```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 3600
```

---

## Troubleshooting

### View Logs
```bash
docker-compose logs -f
```

### Restart Container
```bash
docker-compose restart
```

### Rebuild from Scratch
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Check Container Health
```bash
docker ps
docker inspect youtube-subscriptions
```

---

## Security Tips

1. **Use HTTPS** - Always use a reverse proxy with SSL
2. **Firewall** - Only expose port 3000 to localhost, use reverse proxy for external access
3. **Updates** - Keep Docker and the app updated
4. **Backups** - Browser data is stored locally, but consider backing up your subscriptions via JSON export

---

## Performance

- **Memory**: ~50MB
- **CPU**: Minimal (static files)
- **Storage**: ~10MB for app + browser storage

---

## Advanced: Custom Port

Change port in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Use port 8080 instead
```

---

## Support

- Check logs: `docker-compose logs -f`
- Restart: `docker-compose restart`
- Rebuild: `docker-compose up -d --build`
