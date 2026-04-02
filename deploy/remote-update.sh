#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/messenger-app}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BUILD_SERVICES="${BUILD_SERVICES:-web backend edge}"
RUNTIME_SERVICES="${RUNTIME_SERVICES:-web backend edge postgres-exporter tempo otel-collector prometheus grafana}"
STATUS_FILE="${DEPLOY_STATUS_FILE:-}"

if [[ -n "$STATUS_FILE" ]]; then
  trap 'status=$?; trap - EXIT; printf "%s" "$status" > "$STATUS_FILE"; exit "$status"' EXIT
fi

if docker compose version >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

cd "$APP_DIR"

git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1 || true

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to deploy: working tree has local changes in $APP_DIR" >&2
  exit 1
fi

git fetch origin main
git checkout main
git pull --ff-only origin main

"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build $BUILD_SERVICES
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate $RUNTIME_SERVICES
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
