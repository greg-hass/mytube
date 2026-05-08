#!/bin/sh
set -eu

shutdown() {
  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi

  nginx -s quit 2>/dev/null || true
}

trap shutdown INT TERM

PORT="${PORT:-3001}" node /app/server/index.js &
API_PID="$!"

nginx -g 'daemon off;' &
NGINX_PID="$!"

while true; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID" || true
    shutdown
    exit 1
  fi

  if ! kill -0 "$NGINX_PID" 2>/dev/null; then
    wait "$NGINX_PID" || true
    shutdown
    exit 1
  fi

  sleep 1
done
