#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# web.sh — Bitcoin transaction web visualizer
#
# Starts the web visualizer server.
#
# Behavior:
#   - Reads PORT env var (default: 3000)
#   - Prints the URL (e.g., http://127.0.0.1:3000) to stdout
#   - Keeps running until terminated (CTRL+C / SIGTERM)
#   - Must serve GET /api/health -> 200 { "ok": true }
#
# TODO: Replace the stub below with your web server start command.
###############################################################################

export PORT="${PORT:-3000}"

# Ensure the React frontend is built
if [[ ! -f "dist/web/public/index.html" ]]; then
  echo "Frontend not found, building..." >&2
  (cd frontend && npm install --silent && npx vite build) >&2
fi

# Start the web visualizer server (serves React UI + API)
exec node dist/web/server.js