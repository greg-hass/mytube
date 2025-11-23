# Deploying YouTube Subscriptions with Dockge

## Prerequisites

1. **Ubuntu Server** with Docker installed
2. **Dockge** installed and running (usually at `http://your-server-ip:5001`)

---

## Step-by-Step Deployment

### Method 1: Using GitHub Repository (Recommended)

1. **Open Dockge** in your browser (`http://your-server-ip:5001`)

2. **Click "Compose" → "New"**

3. **Fill in the form:**
   - **Stack Name:** `youtube-subscriptions`
   - **Compose Content:** Paste this:

```yaml
version: '3.8'

services:
  youtube-subscriptions:
    image: ghcr.io/greg-hass/youtube-subscriptions:latest
    container_name: youtube-subscriptions
    ports:
      - "3000:80"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

4. **Click "Deploy"**

5. **Access your app:** `http://your-server-ip:3000`

---

### Method 2: Build from Source

If you want to build the image yourself:

1. **In Dockge, create a new stack** with this compose file:

```yaml
version: '3.8'

services:
  youtube-subscriptions:
    build:
      context: https://github.com/greg-hass/youtube-subscriptions.git#main
      dockerfile: Dockerfile
    container_name: youtube-subscriptions
    ports:
      - "3000:80"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

2. **Click "Deploy"** (first build will take a few minutes)

---

## Configuration Options

### Change Port

Edit the ports section in Dockge:
```yaml
ports:
  - "8080:80"  # Use port 8080 instead of 3000
```

### Add API Key (Optional)

If you want to set a default YouTube API key:

```yaml
environment:
  - NODE_ENV=production
  - VITE_YOUTUBE_API_KEY=your_api_key_here
```

---

## Remote Access Setup

### Option 1: Nginx Proxy Manager (Easiest with Dockge)

1. **Install Nginx Proxy Manager** in Dockge:
   - Create new stack: `nginx-proxy-manager`
   - Use their official compose file

2. **Add Proxy Host:**
   - Domain: `yourdomain.com`
   - Forward to: `youtube-subscriptions:80`
   - Enable SSL with Let's Encrypt

### Option 2: Cloudflare Tunnel

1. **Add Cloudflare Tunnel to your stack:**

```yaml
version: '3.8'

services:
  youtube-subscriptions:
    image: ghcr.io/greg-hass/youtube-subscriptions:latest
    container_name: youtube-subscriptions
    ports:
      - "3000:80"
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared-tunnel
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=your_tunnel_token_here
    restart: unless-stopped
```

2. **Get tunnel token from Cloudflare Zero Trust dashboard**

---

## Updating the App

### In Dockge:

1. **Click on your stack** (`youtube-subscriptions`)
2. **Click "Update"** or **"Recreate"**
3. Dockge will pull the latest image and restart

### Enable Auto-Updates:

Add Watchtower to your compose file:

```yaml
version: '3.8'

services:
  youtube-subscriptions:
    image: ghcr.io/greg-hass/youtube-subscriptions:latest
    container_name: youtube-subscriptions
    ports:
      - "3000:80"
    restart: unless-stopped
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 3600 --cleanup
    restart: unless-stopped
```

---

## Monitoring in Dockge

Dockge provides:
- ✅ **Real-time logs** - Click "Logs" button
- ✅ **Resource usage** - CPU, Memory, Network
- ✅ **Container status** - Health checks
- ✅ **Quick actions** - Start, Stop, Restart, Update

---

## Troubleshooting

### Container won't start
1. Check logs in Dockge (click "Logs")
2. Verify port 3000 isn't already in use
3. Try changing the port in compose file

### Can't access remotely
1. Check Ubuntu firewall: `sudo ufw allow 3000`
2. Verify container is running in Dockge
3. Test locally first: `curl http://localhost:3000`

### App not loading
1. Check nginx logs in Dockge
2. Verify build completed successfully
3. Try rebuilding: Click "Recreate" in Dockge

---

## Complete Example Stack

Here's a complete stack with everything:

```yaml
version: '3.8'

services:
  # Main app
  youtube-subscriptions:
    image: ghcr.io/greg-hass/youtube-subscriptions:latest
    container_name: youtube-subscriptions
    ports:
      - "3000:80"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

  # Auto-updates
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 3600 --cleanup --label-enable
    restart: unless-stopped
```

---

## Next Steps

1. ✅ Deploy in Dockge
2. ✅ Test locally at `http://your-server-ip:3000`
3. ✅ Set up remote access (Nginx Proxy Manager or Cloudflare)
4. ✅ Import your YouTube subscriptions (OPML or JSON)
5. ✅ Enjoy!

---

## Tips

- **Backup your data:** Export subscriptions as JSON regularly
- **Use HTTPS:** Always use a reverse proxy with SSL for remote access
- **Monitor resources:** Check Dockge dashboard for CPU/memory usage
- **Keep updated:** Enable Watchtower for automatic updates

---

## Support

- **Dockge Issues:** https://github.com/louislam/dockge
- **App Issues:** Check logs in Dockge
- **Can't connect:** Verify firewall and port forwarding
