#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/messenger-app}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
SERVICES="${SERVICES:-web backend edge}"

cd "$APP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to deploy: working tree has local changes in $APP_DIR" >&2
  exit 1
fi

git fetch origin main
git checkout main
git pull --ff-only origin main

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache $SERVICES
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate $SERVICES
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
