#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy-vps.sh --host <server-ip-or-domain> [options]

Options:
  --host <value>               Required. VPS host or IP.
  --user <value>               SSH user. Default: root
  --app-dir <value>            Remote app directory. Default: /opt/fastifly
  --db <sqlite|postgres>       Database mode. Default: sqlite
  --app-port <value>           Host port for Fastifly. Default: 3000
  --app-url <value>            Public app URL. Default: http://<host>
  --domain <value>             Domain for TLS proxy (example: fastifly.example.com).
  --setup-caddy                Install/configure Caddy as HTTPS reverse proxy for --domain.
  --cookie-secure <true|false> Cookie secure flag. Auto from app URL if omitted.
  --session-secret <value>     Session secret (>=32 chars). Auto-generated if omitted.
  --postgres-password <value>  Required for --db postgres. Auto-generated if omitted.
  --skip-docker-install        Skip Docker installation step.
  --help                       Show this help.

Examples:
  scripts/deploy-vps.sh --host 156.67.25.168 --db sqlite --app-url http://156.67.25.168
  scripts/deploy-vps.sh --host 156.67.25.168 --domain fastifly.nbb.ai --setup-caddy
  scripts/deploy-vps.sh --host fastifly.example.com --db postgres --app-url https://fastifly.example.com --setup-caddy --domain fastifly.example.com
USAGE
}

log() {
  printf '[deploy-vps] %s\n' "$*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n'
  fi
}

HOST=""
SSH_USER="root"
APP_DIR="/opt/fastifly"
DB_MODE="sqlite"
FASTIFLY_PORT="3000"
APP_URL=""
DOMAIN=""
COOKIE_SECURE=""
SESSION_SECRET=""
POSTGRES_PASSWORD=""
SKIP_DOCKER_INSTALL="false"
SETUP_CADDY="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --user)
      SSH_USER="${2:-}"
      shift 2
      ;;
    --app-dir)
      APP_DIR="${2:-}"
      shift 2
      ;;
    --db)
      DB_MODE="${2:-}"
      shift 2
      ;;
    --app-port)
      FASTIFLY_PORT="${2:-}"
      shift 2
      ;;
    --app-url)
      APP_URL="${2:-}"
      shift 2
      ;;
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --setup-caddy)
      SETUP_CADDY="true"
      shift
      ;;
    --cookie-secure)
      COOKIE_SECURE="${2:-}"
      shift 2
      ;;
    --session-secret)
      SESSION_SECRET="${2:-}"
      shift 2
      ;;
    --postgres-password)
      POSTGRES_PASSWORD="${2:-}"
      shift 2
      ;;
    --skip-docker-install)
      SKIP_DOCKER_INSTALL="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n\n' "$1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$HOST" ]]; then
  printf '--host is required\n\n' >&2
  usage
  exit 1
fi

if [[ "$DB_MODE" != "sqlite" && "$DB_MODE" != "postgres" ]]; then
  printf '--db must be sqlite or postgres\n' >&2
  exit 1
fi

if [[ "$SETUP_CADDY" == "true" && -z "$DOMAIN" ]]; then
  printf '--setup-caddy requires --domain\n' >&2
  exit 1
fi

if [[ -z "$APP_URL" && -n "$DOMAIN" ]]; then
  APP_URL="https://$DOMAIN"
fi

if [[ -z "$APP_URL" ]]; then
  APP_URL="http://$HOST"
fi

if [[ -z "$COOKIE_SECURE" ]]; then
  if [[ "$APP_URL" == https://* ]]; then
    COOKIE_SECURE="true"
  else
    COOKIE_SECURE="false"
  fi
fi

if [[ -z "$SESSION_SECRET" ]]; then
  SESSION_SECRET="$(gen_secret)"
fi

if [[ "$DB_MODE" == "postgres" && -z "$POSTGRES_PASSWORD" ]]; then
  POSTGRES_PASSWORD="$(gen_secret)"
fi

if [[ ${#SESSION_SECRET} -lt 32 ]]; then
  printf 'SESSION_SECRET must be at least 32 characters\n' >&2
  exit 1
fi

require_cmd ssh
require_cmd scp
require_cmd tar

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET="$SSH_USER@$HOST"
CONTROL_PATH="/tmp/fastifly-ssh-${SSH_USER}-${HOST//[^a-zA-Z0-9]/_}"
SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=6
  -o ControlPath="$CONTROL_PATH"
)

TMP_ENV="$(mktemp)"
cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$TARGET" >/dev/null 2>&1 || true
  rm -f "$TMP_ENV"
}
trap cleanup EXIT

log "Opening SSH control connection to $TARGET (you may be prompted for password once)"
ssh "${SSH_OPTS[@]}" -M -fnNT "$TARGET"

if [[ "$SKIP_DOCKER_INSTALL" != "true" ]]; then
  log "Ensuring Docker and Compose are installed on remote host"
  ssh "${SSH_OPTS[@]}" "$TARGET" 'bash -se' <<'REMOTE'
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-v2
fi
systemctl enable --now docker
REMOTE
fi

if [[ "$SETUP_CADDY" == "true" ]]; then
  log "Ensuring Caddy is installed and configured for $DOMAIN"
  ssh "${SSH_OPTS[@]}" "$TARGET" "bash -se" <<REMOTE
if ! command -v caddy >/dev/null 2>&1; then
  apt-get update
  apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<'CADDYEOF'
$DOMAIN {
  reverse_proxy 127.0.0.1:3000
}
CADDYEOF
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl restart caddy
REMOTE
fi

log "Syncing repository to $APP_DIR"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p $(printf '%q' "$APP_DIR")"

tar -C "$REPO_ROOT" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.turbo' \
  --exclude='.playwright-mcp' \
  --exclude='*.tsbuildinfo' \
  --exclude='**/*.tsbuildinfo' \
  --exclude='data' \
  --exclude='playwright-mobile-*.png' \
  --exclude='playwright-mobile-*.md' \
  -czf - . | ssh "${SSH_OPTS[@]}" "$TARGET" "tar -xzf - -C $(printf '%q' "$APP_DIR")"

# Clean stale TypeScript incremental metadata so container builds are reproducible.
ssh "${SSH_OPTS[@]}" "$TARGET" "find $(printf '%q' "$APP_DIR") -type f -name '*.tsbuildinfo' -delete"

log "Writing remote environment file"
{
  printf 'FASTIFLY_PORT=%s\n' "$FASTIFLY_PORT"
  printf 'APP_URL=%s\n' "$APP_URL"
  printf 'SESSION_SECRET=%s\n' "$SESSION_SECRET"
  printf 'COOKIE_SECURE=%s\n' "$COOKIE_SECURE"
  if [[ "$DB_MODE" == "postgres" ]]; then
    printf 'POSTGRES_PASSWORD=%s\n' "$POSTGRES_PASSWORD"
  fi
} > "$TMP_ENV"

scp "${SSH_OPTS[@]}" "$TMP_ENV" "$TARGET:$APP_DIR/.env.vps" >/dev/null

if [[ "$DB_MODE" == "sqlite" ]]; then
  COMPOSE_FILE='docker-compose.sqlite.yml'
else
  COMPOSE_FILE='docker-compose.postgres.yml'
fi

log "Running migrations"
ssh "${SSH_OPTS[@]}" "$TARGET" "cd $(printf '%q' "$APP_DIR") && docker compose --env-file .env.vps -f $COMPOSE_FILE run --rm fastifly-migrate"

log "Starting Fastifly stack"
ssh "${SSH_OPTS[@]}" "$TARGET" "cd $(printf '%q' "$APP_DIR") && docker compose --env-file .env.vps -f $COMPOSE_FILE up -d --build"

log "Health check (with startup retries)"
ssh "${SSH_OPTS[@]}" "$TARGET" "bash -se" <<REMOTE
for i in \$(seq 1 30); do
  if curl -fsS http://127.0.0.1:$FASTIFLY_PORT/health >/dev/null 2>&1 && \
     curl -fsS http://127.0.0.1:$FASTIFLY_PORT/ready >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:$FASTIFLY_PORT/health && echo
    curl -fsS http://127.0.0.1:$FASTIFLY_PORT/ready && echo
    exit 0
  fi
  sleep 2
done
echo "Fastifly did not become ready within retry window" >&2
exit 1
REMOTE

log "Deployment complete"
log "App URL: $APP_URL"
log "Remote path: $APP_DIR"
if [[ "$DB_MODE" == "postgres" ]]; then
  log "Postgres password has been written to $APP_DIR/.env.vps"
fi
