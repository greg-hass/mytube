# AGENTS.md

## Purpose

This repository is a self-hosted/server/infrastructure project intended for long-term production use.

Priorities:

1. Correctness
2. Reliability
3. Maintainability
4. Security
5. Performance

Prefer simple, explicit solutions.
Do not optimize prematurely.

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
- Prefer automatic HTTPS where supported.
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
- SQLite should use WAL mode where concurrent access is expected.

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
- compose.yml

Commands:
bash docker compose config docker compose build docker compose up -d docker compose ps

Failure inspection:
bash docker compose logs

Rules:

- docker compose config must pass before changing compose files.
- Verify containers are healthy before declaring success.
- Check logs when containers fail or restart.
- Prefer minimal images.
- Pin image versions where practical.
- Preserve persistent volume mappings.
- Avoid breaking existing container names, networks, or mounts.
- Avoid privileged containers unless explicitly required.

---

## Reverse Proxy / Ingress

Files:

- Caddyfile
- nginx.conf
- traefik.yml
- traefik.toml

Rules:

- Do not commit TLS certificates or private keys.
- Preserve existing hostnames, routes, and middleware unless required.
- Do not expose admin interfaces publicly.
- Auth endpoints should have rate limiting where practical.
- Avoid unnecessary public ports.

---

## Node.js / TypeScript

Files:

- package.json

Preferred commands:
bash npm run lint npm run typecheck npm test npm run build

Fallbacks:
bash npx eslint . npx tsc --noEmit

Rules:

- Prefer scripts defined in package.json.
- Do not add dependencies when existing tooling can solve the problem.

---

## Python

Files:

- pyproject.toml
- requirements.txt

Preferred commands:
bash pytest ruff check . mypy .

Fallback:
bash python -m build

Rules:

- Prefer pyproject.toml configuration when present.
- Do not mix dependency managers unless already established.

---

## Shell Scripts

Files:

- *.sh

Commands:
bash shellcheck .

Rules:

- Use set -euo pipefail where appropriate.
- Quote variables safely.
- Avoid destructive commands without explicit confirmation.
- Avoid curl | bash patterns unless already established.

---

## Output Expectations

When making changes:

- Explain what changed
- Explain why
- Identify risks and tradeoffs
- List affected files
- List commands run and results
- Keep explanations concise

For audits and reviews:

- Prioritize systemic issues
- Provide evidence-based findings
- Focus on foundational problems first

---

## Repository Notes

- Environment variables must not be hardcoded.
- Secrets must never be committed.
- Prefer configuration through environment variables or config files.
- Healthchecks and graceful shutdowns are required for long-running services.
- Preserve backwards compatibility for APIs and persistent storage.
- Avoid infrastructure changes without clear operational justification.
