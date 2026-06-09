#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# setup.sh — Install project dependencies
#
# Add your install commands below (e.g., npm install, pip install, cargo build).
# This script is run once before grading to set up the environment.
###############################################################################

# Install Node.js dependencies (backend)
npm install

# Compile TypeScript to JavaScript (backend)
npx tsc

# Build React frontend with Vite → dist/web/public/
cd frontend
npm install
npx vite build
cd ..

# Decompress block fixtures if not already present
for gz in fixtures/blocks/*.dat.gz; do
  dat="${gz%.gz}"
  if [[ ! -f "$dat" ]]; then
    echo "Decompressing $(basename "$gz")..."
    gunzip -k "$gz"
  fi
done

echo "Setup complete"
