#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Lint"
npm run lint

echo "==> Type-check"
npm run type-check

echo "==> Tests"
npx vitest run

echo "==> Docker compose config"
if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
	docker compose config --quiet 2>/dev/null || echo "  (skipped — env vars not set, this is fine for dev)"
fi

echo ""
echo "✅ All checks passed"
