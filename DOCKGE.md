# Dockge Deployment - Simple Version

## Option 1: Clone and Build Locally (Recommended)

### Step 1: SSH into your Ubuntu server

### Step 2: Clone the repository
```bash
cd ~
git clone https://github.com/greg-hass/youtube-subscriptions.git
cd youtube-subscriptions
```

### Step 3: In Dockge, create a new stack

**Stack Name:** `youtube-subscriptions`

**Compose Content:**
```yaml
version: '3.8'

services:
  youtube-subscriptions:
    build: .
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

**Important:** In Dockge, set the **Working Directory** to: `/root/youtube-subscriptions` (or wherever you cloned it)

### Step 4: Click "Deploy"

---

## Option 2: Manual Docker Build (If Dockge doesn't work)

```bash
# SSH into your server
cd ~/youtube-subscriptions

# Build the image
docker build -t youtube-subscriptions .

# Run with docker-compose
docker-compose up -d
```

Then access at `http://your-server-ip:3000`

---

## Option 3: Use Pre-built Image (Coming Soon)

Once I push to GitHub Container Registry, you can use:

```yaml
version: '3.8'

services:
  youtube-subscriptions:
    image: ghcr.io/greg-hass/youtube-subscriptions:latest
    container_name: youtube-subscriptions
    ports:
      - "3000:80"
    restart: unless-stopped
```

---

## Quick Fix for Your Current Error

The error happens because Docker can't authenticate to GitHub. Here's the fix:

1. **In Dockge, delete the current stack**

2. **SSH into your server:**
```bash
cd /opt/stacks  # or wherever Dockge stores stacks
mkdir youtube-subscriptions
cd youtube-subscriptions
git clone https://github.com/greg-hass/youtube-subscriptions.git .
```

3. **Back in Dockge, create new stack** with this compose:
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:80"
    restart: unless-stopped
```

4. **Set the working directory** in Dockge to where you cloned the repo

5. **Deploy!**

---

## Troubleshooting

**If build fails:**
- Make sure you cloned the repo first
- Check Dockge's working directory setting
- Try building manually: `docker build -t youtube-subscriptions .`

**If port 3000 is taken:**
- Change to `"8080:80"` or any other port

**Can't access from browser:**
- Check firewall: `sudo ufw allow 3000`
- Verify container is running: `docker ps`
