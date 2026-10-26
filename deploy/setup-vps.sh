#!/usr/bin/env bash
# =============================================================================
# Kredo Portal Backend — VPS Deployment Script
# Run this on your Ubuntu/Debian VPS to set up everything from scratch.
# Usage:  chmod +x deploy/setup-vps.sh && sudo ./deploy/setup-vps.sh
# =============================================================================
set -euo pipefail

APP_USER="kredo"
APP_DIR="/opt/kredo-portal-backend"
NODE_VERSION="22"
LOG_DIR="/var/log/kredo"

echo "═══════════════════════════════════════════════════════"
echo "  Kredo Portal Backend — VPS Production Setup"
echo "═══════════════════════════════════════════════════════"

# ── 1. System updates ──
echo "[1/8] Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git build-essential nginx certbot python3-certbot-nginx ufw

# ── 2. Install Node.js via NodeSource ──
echo "[2/8] Installing Node.js ${NODE_VERSION}..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

# ── 3. Install PM2 globally ──
echo "[3/8] Installing PM2..."
npm install -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

# ── 4. Create application user and directories ──
echo "[4/8] Creating application user and directories..."
id -u ${APP_USER} &>/dev/null || useradd --system --shell /bin/bash --home-dir ${APP_DIR} ${APP_USER}
mkdir -p ${APP_DIR} ${LOG_DIR}
chown -R ${APP_USER}:${APP_USER} ${APP_DIR} ${LOG_DIR}

# ── 5. Install MongoDB (if not already installed) ──
echo "[5/8] Checking MongoDB..."
if ! command -v mongod &>/dev/null; then
  echo "  Installing MongoDB 8..."
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-8.0.list
  apt-get update
  apt-get install -y mongodb-org
  systemctl enable mongod
  systemctl start mongod
  echo "  MongoDB installed and started."
else
  echo "  MongoDB already installed: $(mongod --version | head -1)"
fi

# ── 6. Configure firewall ──
echo "[6/8] Configuring UFW firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# Don't expose port 5000 publicly — only accessible via Nginx proxy
echo "y" | ufw enable || true
ufw status

# ── 7. Nginx config ──
echo "[7/8] Setting up Nginx..."
if [ -f "nginx/kredo-api.conf" ]; then
  cp nginx/kredo-api.conf /etc/nginx/sites-available/kredo-api
  ln -sf /etc/nginx/sites-available/kredo-api /etc/nginx/sites-enabled/kredo-api
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  echo "  Nginx configured. Remember to:"
  echo "    1. Edit /etc/nginx/sites-available/kredo-api — replace 'api.yourdomain.com'"
  echo "    2. Run: sudo certbot --nginx -d api.yourdomain.com"
fi

# ── 8. PM2 startup on reboot ──
echo "[8/8] Configuring PM2 startup..."
pm2 startup systemd -u ${APP_USER} --hp ${APP_DIR}

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ VPS setup complete!"
echo ""
echo "  Next steps:"
echo "    1. Clone your repo to ${APP_DIR}"
echo "    2. Copy .env.example → .env and fill in secrets"
echo "    3. Run:  npm ci --production && npm run build"
echo "    4. Run:  pm2 start ecosystem.config.cjs"
echo "    5. Run:  pm2 save"
echo "    6. Set up SSL: sudo certbot --nginx -d api.yourdomain.com"
echo "═══════════════════════════════════════════════════════"
