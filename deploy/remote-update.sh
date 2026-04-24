#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/messenger-app}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BUILD_SERVICES="${BUILD_SERVICES:-web backend edge}"
SUPPORT_SERVICES="${SUPPORT_SERVICES:-postgres redis jitsi-prosody jitsi-jicofo jitsi-jvb jitsi-web}"
RUNTIME_SERVICES="${RUNTIME_SERVICES:-web backend edge}"
OBSERVABILITY_SERVICES="${OBSERVABILITY_SERVICES:-postgres-exporter tempo otel-collector alertmanager loki promtail prometheus grafana}"
STATUS_FILE="${DEPLOY_STATUS_FILE:-}"

env_file_value() {
  local key="$1"
  local default_value="$2"
  local line

  if [[ -f "$ENV_FILE" ]]; then
    line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      local value="${line#*=}"
      value="${value%$'\r'}"
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      printf "%s" "$value"
      return
    fi
  fi

  printf "%s" "$default_value"
}

validate_replica_count() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "$name must be a positive integer, got '$value'" >&2
    exit 1
  fi
}

normalize_boolean_flag() {
  local name="$1"
  local value="$2"

  case "${value,,}" in
    true|1|yes|on)
      printf "true"
      ;;
    false|0|no|off|"")
      printf "false"
      ;;
    *)
      echo "$name must be a boolean value, got '$value'" >&2
      exit 1
      ;;
  esac
}

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
WEB_APP_REVISION="$(git rev-parse HEAD)"
export WEB_APP_REVISION

BACKEND_REPLICAS="${BACKEND_REPLICAS:-$(env_file_value BACKEND_REPLICAS 1)}"
WEB_REPLICAS="${WEB_REPLICAS:-$(env_file_value WEB_REPLICAS 1)}"
ENABLE_OBSERVABILITY_STACK="$(normalize_boolean_flag ENABLE_OBSERVABILITY_STACK "${ENABLE_OBSERVABILITY_STACK:-$(env_file_value ENABLE_OBSERVABILITY_STACK false)}")"
validate_replica_count BACKEND_REPLICAS "$BACKEND_REPLICAS"
validate_replica_count WEB_REPLICAS "$WEB_REPLICAS"

runtime_scale_args=()
if [[ " $RUNTIME_SERVICES " == *" backend "* ]]; then
  runtime_scale_args+=(--scale "backend=${BACKEND_REPLICAS}")
fi
if [[ " $RUNTIME_SERVICES " == *" web "* ]]; then
  runtime_scale_args+=(--scale "web=${WEB_REPLICAS}")
fi

"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config >/dev/null
echo "Building web revision: $WEB_APP_REVISION"
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build $BUILD_SERVICES
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d $SUPPORT_SERVICES
echo "Runtime replicas: backend=${BACKEND_REPLICAS}, web=${WEB_REPLICAS}"
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate "${runtime_scale_args[@]}" $RUNTIME_SERVICES

if [[ "$ENABLE_OBSERVABILITY_STACK" == "true" ]]; then
  echo "Observability stack: enabled"
  "${compose_cmd[@]}" --profile observability -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate $OBSERVABILITY_SERVICES
else
  echo "Observability stack: disabled"
  "${compose_cmd[@]}" --profile observability -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop $OBSERVABILITY_SERVICES >/dev/null 2>&1 || true
  "${compose_cmd[@]}" --profile observability -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f $OBSERVABILITY_SERVICES >/dev/null 2>&1 || true
fi

"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
