#!/bin/sh
set -eu

DOMAIN="kredo-backend.omnisuiteai.com"
WWW_DOMAIN="www.kredo-backend.omnisuiteai.com"
PORT="5099"
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$PROJECT_DIR/.env"
NGINX_SITE="/etc/nginx/sites-available/kredo-portal-backend"
NGINX_LINK="/etc/nginx/sites-enabled/kredo-portal-backend"

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

if [ "$(id -u)" -ne 0 ]; then
  fail "Run with sudo, for example: sudo sh deploy.sh"
fi

DEPLOY_USER=${DEPLOY_USER:-root}
id "$DEPLOY_USER" >/dev/null 2>&1 || fail "Deployment user '$DEPLOY_USER' does not exist."
DEPLOY_GROUP=$(id -gn "$DEPLOY_USER")
DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
[ -n "$DEPLOY_HOME" ] || fail "Could not determine the home directory for '$DEPLOY_USER'."

if [ "$DEPLOY_USER" = "root" ]; then
  printf '%s\n' "Warning: running the API as root is less secure than using a dedicated service account."
fi

[ -f "$PROJECT_DIR/package.json" ] || fail "Run this script from the backend project."
[ -f "$PROJECT_DIR/ecosystem.config.cjs" ] || fail "ecosystem.config.cjs is missing."
[ -f "$ENV_FILE" ] || fail "Create .env from .env.example and configure production values first."

require_env() {
  if ! grep -Eq "^[[:space:]]*$1[[:space:]]*=[[:space:]]*[^[:space:]#]" "$ENV_FILE"; then
    fail "Set a non-empty $1 in $ENV_FILE."
  fi
}

require_env MONGODB_URI
require_env JWT_SECRET
require_env MASTER_EMAIL
require_env MASTER_PASSWORD
require_env FRONTEND_URL
require_env CORS_ORIGINS

if grep -Eq '^[[:space:]]*(JWT_SECRET[[:space:]]*=[[:space:]]*replace-me-with-a-long-random-secret|MASTER_EMAIL[[:space:]]*=[[:space:]]*admin@kredo\.local|MASTER_PASSWORD[[:space:]]*=[[:space:]]*ChangeMe123!|PARTNER_EMAIL[[:space:]]*=[[:space:]]*partner@kredo\.local|PARTNER_PASSWORD[[:space:]]*=[[:space:]]*ChangeMe123!|FRONTEND_URL[[:space:]]*=[[:space:]]*https://yourdomain\.com|CORS_ORIGINS[[:space:]]*=[[:space:]]*https://yourdomain\.com)' "$ENV_FILE"; then
  fail "Replace the sample production credentials and origins in $ENV_FILE."
fi

if grep -Eq '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[^#]*<[^>]+>' "$ENV_FILE"; then
  fail "Replace all <...> placeholders in $ENV_FILE with real production values."
fi

if grep -Eq '^[[:space:]]*MONGODB_URI[[:space:]]*=[[:space:]]*mongodb://(127\.0\.0\.1|localhost)(:[0-9]+)?/' "$ENV_FILE" \
  && ! systemctl is-active --quiet mongod; then
  fail "MONGODB_URI points to localhost, but MongoDB is not active. Configure a reachable production database first."
fi

if ! runuser -u "$DEPLOY_USER" -- test -r "$ENV_FILE"; then
  fail "Make $ENV_FILE readable by '$DEPLOY_USER' (keep it private, e.g. mode 600)."
fi
chown "$DEPLOY_USER:$DEPLOY_GROUP" "$ENV_FILE"
chmod 0600 "$ENV_FILE"

if [ ! -r /etc/os-release ] || ! grep -Eq '^ID=(ubuntu|debian)$' /etc/os-release; then
  fail "This deployment script supports Ubuntu and Debian."
fi

CERTBOT_EMAIL=${CERTBOT_EMAIL:-}
if [ -z "$CERTBOT_EMAIL" ]; then
  printf "Email for Let's Encrypt certificate notices: "
  read -r CERTBOT_EMAIL
fi
[ -n "$CERTBOT_EMAIL" ] || fail "A Let's Encrypt email address is required."

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx
else
  fail "apt-get is required to install deployment packages."
fi

install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
chmod 0644 /etc/apt/keyrings/nodesource.gpg
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main\n' \
  "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/nodesource.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
npm install --global pm2

run_as_deploy() {
  runuser -u "$DEPLOY_USER" -- env HOME="$DEPLOY_HOME" PATH="$PATH" \
    sh -c 'cd "$1" && shift && exec "$@"' sh "$PROJECT_DIR" "$@"
}

for generated_dir in "$PROJECT_DIR/node_modules" "$PROJECT_DIR/dist"; do
  if [ -d "$generated_dir" ]; then
    chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$generated_dir"
  fi
done

run_as_deploy npm ci
run_as_deploy npm run build

install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_GROUP" /var/log/kredo
touch /var/log/kredo/error.log /var/log/kredo/out.log
chown "$DEPLOY_USER:$DEPLOY_GROUP" /var/log/kredo/error.log /var/log/kredo/out.log
chmod 0640 /var/log/kredo/error.log /var/log/kredo/out.log
run_as_deploy pm2 startOrReload ecosystem.config.cjs --update-env
run_as_deploy pm2 save

NODE_BIN=$(dirname "$(command -v node)")
PM2_BIN=$(command -v pm2)
env PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin" "$PM2_BIN" startup systemd \
  -u "$DEPLOY_USER" --hp "$DEPLOY_HOME"
run_as_deploy pm2 save

attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:$PORT/api/portal/health" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    run_as_deploy pm2 logs kredo-portal-backend --lines 50 --nostream || true
    fail "The API did not become healthy on port $PORT."
  fi
  sleep 2
done

cat > "$NGINX_SITE" <<EOF
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
EOF

ln -sfn "$NGINX_SITE" "$NGINX_LINK"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q '^Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi
nginx -t
systemctl enable --now nginx
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --no-eff-email --redirect \
  --email "$CERTBOT_EMAIL" -d "$DOMAIN" -d "$WWW_DOMAIN"
nginx -t
systemctl reload nginx

printf '\nDeployment finished.\n'
printf 'API health check: https://%s/api/portal/health\n' "$DOMAIN"
printf 'PM2 logs: runuser -u %s -- env HOME=%s pm2 logs kredo-portal-backend\n' \
  "$DEPLOY_USER" "$DEPLOY_HOME"
