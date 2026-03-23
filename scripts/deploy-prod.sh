#!/usr/bin/env bash
set -euo pipefail

# Production deploy helper.
# Intended to be run on the server from repo root:
#   npm run deploy:prod
#
# Optional env vars:
#   APP_NAME=modaire             # PM2 process name
#   SKIP_GIT_PULL=1              # Skip git pull if you already updated code
#   USE_LEGACY_PEER_DEPS=1       # Use npm ci --legacy-peer-deps

APP_NAME="${APP_NAME:-modaire}"
USE_LEGACY_PEER_DEPS="${USE_LEGACY_PEER_DEPS:-1}"

echo "==> Deploy started at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "==> Working directory: $(pwd)"

if [[ ! -f "package.json" || ! -f "prisma/schema.prisma" ]]; then
  echo "ERROR: Run this script from the project root (package.json + prisma/schema.prisma required)."
  exit 1
fi

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  echo "==> Pulling latest main"
  git pull origin main
fi

echo "==> Installing dependencies"
if [[ "$USE_LEGACY_PEER_DEPS" == "1" ]]; then
  npm ci --legacy-peer-deps --no-audit --no-fund
else
  npm ci --no-audit --no-fund
fi

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Building application"
npm run build

echo "==> Restarting PM2 process: $APP_NAME"
pm2 restart "$APP_NAME" --update-env || pm2 start npm --name "$APP_NAME" -- run start
pm2 save
pm2 status

echo "==> Health check"
curl -I -s http://127.0.0.1:3000 | head -n 1 || true

echo "==> Deploy completed"
