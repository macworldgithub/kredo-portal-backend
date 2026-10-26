#!/usr/bin/env bash
# =============================================================================
# Kredo Portal Backend — Zero-Downtime Deploy
# Run on VPS to pull latest code and reload with zero downtime.
# Usage:  ./deploy/deploy.sh
# =============================================================================
set -euo pipefail

APP_DIR="/opt/kredo-portal-backend"

echo "═══════════════════════════════════════════════════════"
echo "  Deploying Kredo Portal Backend..."
echo "═══════════════════════════════════════════════════════"

cd ${APP_DIR}

# Pull latest code
echo "[1/4] Pulling latest code..."
git pull origin main

# Install dependencies
echo "[2/4] Installing dependencies..."
npm ci --production

# Build
echo "[3/4] Building..."
npm run build

# Reload PM2 with zero downtime
echo "[4/4] Reloading PM2 (zero downtime)..."
pm2 reload ecosystem.config.cjs
pm2 save

echo ""
echo "✅ Deployment complete!"
echo "   Check status: pm2 status"
echo "   Check logs:   pm2 logs kredo-portal-backend"
