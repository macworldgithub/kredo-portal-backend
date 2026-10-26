#!/bin/sh
set -eu

DOMAIN="kredo-backend.omnisuiteai.com"
WWW_DOMAIN="www.kredo-backend.omnisuiteai.com"
PORT="5099"
APP_NAME="kredo-portal-backend"
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$PROJECT_DIR/.env"
NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
NGINX_LINK="/etc/nginx/sites-enabled/$APP_NAME"

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run with sudo or as root."
DEPLOY_USER=${DEPLOY_USER:-root}
id "$DEPLOY_USER" >/dev/null 2>&1 || fail "Unknown deployment user: $DEPLOY_USER"
DEPLOY_GROUP=$(id -gn "$DEPLOY_USER")
DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
[ -n "$DEPLOY_HOME" ] || fail "No home directory for $DEPLOY_USER"

for cmd in npm node pm2 nginx curl runuser; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is not installed"
done
[ -f "$PROJECT_DIR/package.json" ] || fail "package.json missing"
[ -f "$PROJECT_DIR/package-lock.json" ] || fail "package-lock.json missing (required by npm ci)"
[ -f "$PROJECT_DIR/ecosystem.config.cjs" ] || fail "ecosystem.config.cjs missing"
[ -f "$ENV_FILE" ] || fail ".env missing"

# Keep the ecosystem configuration aligned with a single forked worker.
PROJECT_DIR="$PROJECT_DIR" APP_NAME="$APP_NAME" node - <<'NODE' || fail "Set instances: 1 and exec_mode: 'fork' in ecosystem.config.cjs"
const path = require('path');
const config = require(path.join(process.env.PROJECT_DIR, 'ecosystem.config.cjs'));
const matches = (config.apps || []).filter(app => app.name === process.env.APP_NAME);
if (matches.length !== 1 || matches[0].instances !== 1 || matches[0].exec_mode !== 'fork') process.exit(1);
NODE

run_as_deploy() {
  runuser -u "$DEPLOY_USER" -- env HOME="$DEPLOY_HOME" PATH="$PATH" \
    sh -c 'cd "$1" && shift && exec "$@"' sh "$PROJECT_DIR" "$@"
}

printf '\n=== Deploying %s ===\n' "$APP_NAME"

# Build before touching the running PM2 process.
run_as_deploy npm ci
run_as_deploy npm run build

install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" /var/log/kredo
touch /var/log/kredo/error.log /var/log/kredo/out.log
chown "$DEPLOY_USER:$DEPLOY_GROUP" /var/log/kredo/error.log /var/log/kredo/out.log
chmod 0640 /var/log/kredo/error.log /var/log/kredo/out.log

# Older deployments may still have cluster workers. Replace only this app
# when its active PM2 mode/count differs from the desired configuration.
PM2_STATE=$(run_as_deploy pm2 jlist | node -e '
let s=""; process.stdin.on("data", c => s += c); process.stdin.on("end", () => {
  const apps = JSON.parse(s).filter(p => p.name === "kredo-portal-backend");
  if (!apps.length) console.log("absent");
  else if (apps.length === 1 && apps[0].pm2_env.exec_mode === "fork_mode") console.log("correct");
  else console.log("replace");
});')

case "$PM2_STATE" in
  replace)
    echo "Replacing old cluster/duplicate instances with one fork instance..."
    run_as_deploy pm2 delete "$APP_NAME"
    run_as_deploy pm2 start ecosystem.config.cjs --only "$APP_NAME" --update-env
    ;;
  absent)
    run_as_deploy pm2 start ecosystem.config.cjs --only "$APP_NAME" --update-env
    ;;
  correct)
    run_as_deploy pm2 restart "$APP_NAME" --update-env
    ;;
  *) fail "Cannot determine PM2 application state" ;;
esac
run_as_deploy pm2 save

echo "Checking local API health..."
attempt=0
until curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/portal/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    run_as_deploy pm2 logs "$APP_NAME" --lines 50 --nostream || true
    fail "API health check failed on port $PORT"
  fi
  sleep 2
done

# Do not overwrite an existing Nginx/Certbot site on repeat deployments.
if [ ! -f "$NGINX_SITE" ]; then
  echo "Creating Nginx site..."
  cat > "$NGINX_SITE" <<EOF_NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN $WWW_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF_NGINX
fi
ln -sfn "$NGINX_SITE" "$NGINX_LINK"
nginx -t
systemctl reload nginx

# SSL is optional on redeploy; issue a certificate only when requested.
if [ -n "${CERTBOT_EMAIL:-}" ]; then
  command -v certbot >/dev/null 2>&1 || fail "certbot is not installed"
  if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    certbot --nginx --non-interactive --agree-tos --no-eff-email --redirect \
      --email "$CERTBOT_EMAIL" -d "$DOMAIN" -d "$WWW_DOMAIN"
    nginx -t
    systemctl reload nginx
  fi
fi

printf '\nDeployment completed.\nLocal health: http://127.0.0.1:%s/api/portal/health\n' "$PORT"
run_as_deploy pm2 status