#!/usr/bin/env bash
set -euo pipefail

tracked_env_files="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' || true)"

if [[ -n "$tracked_env_files" ]]; then
	echo "Tracked environment files are forbidden:"
	echo "$tracked_env_files"
	exit 1
fi
