# AGENTS.md

## Project Overview

YouTube RSS Subscriptions — a self-hosted, RSS-first YouTube feed reader. Tracks watched state, filters Shorts, queues videos for later, and stays RSS-first so routine refreshes don't burn YouTube API quota.

It's a feed reader, not a video archive. Videos still play through YouTube.

### Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 3, Zustand, TanStack Query
- **Server:** Node.js, Express (implied), SQLite (WAL mode)
- **Container:** `ghcr.io/greg-hass/youtube-subscriptions:latest`
- **Port mapping:** Host `5173` → Container `8080`
- **Volume:** `mytube-data` → `/app/server/data`
- **Health check:** `http://localhost:8080/api/healthz`

### Key Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SERVER_API_TOKEN` | Yes | Bearer token for all `/api/*` requests |
| `YOUTUBE_API_KEY` | No | Capped fallback for channel handle resolution |
| `FEED_REFRESH_ENABLED` | No | Enable background feed refresh (default: `true`) |
| `FEED_REFRESH_INTERVAL_MINUTES` | No | Refresh interval (default: `15`) |
| `ALLOWED_ORIGINS` | No | Comma-separated browser origin allowlist |

### Deployment

```bash
export SERVER_API_TOKEN="$(openssl rand -hex 32)"
docker compose up -d
```

---

## Priorities

1. Correctness
2. Reliability
3. Maintainability
4. Security
5. Performance

Prefer simple, explicit solutions. Do not optimize prematurely.

---

## Rules

- Do not make cosmetic-only changes.
- Do not rename services, containers, networks, volumes, routes, environment variables, or APIs without justification.
- Do not introduce unnecessary abstractions.
- Preserve existing architecture unless structural issues require change.
- Prefer existing patterns over introducing new ones.
- Keep diffs focused and minimal.
- Avoid speculative refactors.

New dependencies must:

- Solve a problem not reasonably handled by existing tooling or dependencies
- Be actively maintained
- Have acceptable security posture
- Be justified in the change summary

---

## Infrastructure Standards

- Write production-ready configurations and code.
- Prefer readability and operational clarity over cleverness.
- Validate all external input and configuration.
- Use explicit configuration instead of hidden defaults.
- Preserve backwards compatibility for persistent storage and public APIs.
- Use healthchecks for long-running services.
- Add comments only when intent is non-obvious.

Errors:

- Errors propagate upward where practical.
- Log failures at application/service boundaries.
- Never swallow errors silently.
- Avoid retry storms or infinite restart loops.

Security:

- Secrets must never be committed.
- Do not hardcode credentials, API keys, or tokens.
- Do not expose internal/admin services publicly unless explicitly required.
- Prefer least-privilege access.
- Avoid disabling security features for convenience.

Networking:

- Public exposure must be intentional.
- Preserve existing ports, routes, middleware, and reverse proxy behavior unless changes are required.
- Prefer internal container networking where practical.
- Avoid breaking service discovery or container naming.

Persistence:

- Database migrations must be backwards compatible.
- Never drop volumes, tables, or columns without backup and rollback plans.
- Preserve persistent mount paths and storage layouts.
- SQLite uses WAL mode — do not disable it.
- Backup/restore uses SQLite backup API: `npm run backup:sqlite` / `npm run restore:sqlite`

---

## Testing

Before completing any task:

1. Detect project tooling
2. Validate configuration
3. Run linting/type checks where available
4. Run tests where available
5. Verify services start successfully
6. Verify no regressions

All checks must pass before task completion.

Do not ignore failing checks, unhealthy containers, restart loops, or proxy failures.
Never claim something works without verification.

---

## Tooling Detection

Prefer repository-defined scripts and documented workflows over inferred commands.

Do not invent custom commands.
Do not assume frameworks or tooling without evidence.
If tooling is ambiguous, ask before proceeding.

---

## Docker / Containers

Files:

- Dockerfile
- docker-compose.yml

Commands:

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
docker compose logs
```

Rules:

- `docker compose config` must pass before changing compose files.
- Verify containers are healthy before declaring success.
- Check logs when containers fail or restart.
- Preserve the existing container name (`mytube`) and volume (`mytube-data`).
- Watchtower is enabled via label — do not remove `com.centurylinklabs.watchtower.enable=true`.

---

## Node.js / TypeScript

Files:

- `package.json` (root — frontend)
- `server/package.json` (server)

Preferred commands:

```bash
npm run lint        # ESLint — max 0 warnings
npm run type-check  # tsc --noEmit
npm run test        # Vitest
npm run build       # tsc -b && vite build
```

Server:

```bash
cd server && npm run dev
```

Rules:

- Prefer scripts defined in `package.json`.
- Do not add dependencies when existing tooling can solve the problem.
- Max warnings set to 0 — lint must be clean.

---

## Reverse Proxy / Ingress

The app serves from port `5173` on the host. If behind a reverse proxy (Caddy, nginx, Traefik):

- Preserve existing hostnames, routes, and middleware unless required.
- Do not commit TLS certificates or private keys.
- Do not expose admin interfaces publicly.
- The app requires `Authorization: Bearer <token>` on API requests — ensure the proxy passes auth headers.

---

## Output Expectations

When making changes:

- Explain what changed
- Explain why
- Identify risks and tradeoffs
- List affected files
- List commands run and results
- Keep explanations concise

---

## Architecture Notes

- **RSS-first design:** All feed data comes from YouTube RSS by default. The `YOUTUBE_API_KEY` is optional and only used as a capped fallback for channel handle resolution.
- **SQLite for state:** Subscriptions, watched state, favorites, queue, feed cache, channel refresh state all live in `server/data/youtube-subscriptions.sqlite`.
- **No OAuth required.** The app uses RSS feeds and optionally a server-side API key for channel resolution.
- **PWA-capable:** Frontend supports PWA install via `vite-plugin-pwa`.
- **Rate limiting:** Mutating API requests are rate-limited (`30 req / 60s window` by default).
