#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bashcamp}"
WEB_ROOT="${WEB_ROOT:-/var/www/bashcamp}"
DOMAIN="${DOMAIN:-bashcamp.cloud}"
BRANCH="${BRANCH:-develop}"
SSH_PORT="${SSH_PORT:-22}"
REPO_URL="${REPO_URL:-https://github.com/b-mackenzie-alexander/bashcamp.cloud.git}"

run() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "$1 is required"
}

install_packages() {
  run apt-get update
  run apt-get install -y --no-install-recommends \
    ca-certificates \
    caddy \
    curl \
    docker.io \
    git \
    ufw
}

sync_repository() {
  run mkdir -p "$APP_DIR"
  if [ -d "$APP_DIR/.git" ]; then
    run git -C "$APP_DIR" fetch origin "$BRANCH"
    run git -C "$APP_DIR" checkout "$BRANCH"
    run git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    run git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

validate_config() {
  require_file "$APP_DIR/deploy/.env"
  require_file "$APP_DIR/config/users.json"
  run mkdir -p "$APP_DIR/data"

  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/deploy/.env"
  set +a

  if [ -z "${JWT_SECRET:-}" ] || [ "${JWT_SECRET}" = "replace-with-strong-random-secret" ]; then
    fail "deploy/.env must define JWT_SECRET and it cannot be replace-with-strong-random-secret"
  fi
}

build_images() {
  run docker build "$APP_DIR/docker/base-ubuntu" --tag bashcamp/ubuntu-22.04-base
  run docker build "$APP_DIR/docker/base-rocky" --tag bashcamp/rocky-9-base
  run docker compose -f deploy/docker-compose.yml --env-file deploy/.env build api
}

ensure_network() {
  run docker network inspect bashcamp-net >/dev/null 2>&1 \
    || run docker network create --driver bridge bashcamp-net
}

install_frontend_and_proxy() {
  run mkdir -p "$WEB_ROOT"
  run cp -R "$APP_DIR/frontend/." "$WEB_ROOT/"
  run install -m 0644 "$APP_DIR/proxy/Caddyfile" /etc/caddy/Caddyfile
  run caddy validate --config /etc/caddy/Caddyfile
}

start_services() {
  run docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d api
  run systemctl enable caddy
  run systemctl reload caddy || run systemctl restart caddy
}

configure_firewall() {
  run ufw allow "${SSH_PORT}"/tcp
  run ufw allow 80/tcp
  run ufw allow 443/tcp
  run ufw default deny incoming
  run ufw default allow outgoing
  run ufw --force enable
}

main() {
  install_packages
  sync_repository
  cd "$APP_DIR"
  validate_config
  build_images
  ensure_network
  install_frontend_and_proxy
  start_services
  configure_firewall

  printf 'Bashcamp deployment artifacts installed for %s.\n' "$DOMAIN"
  printf 'Validate DNS, then visit https://%s.\n' "$DOMAIN"
}

main "$@"
