#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-/opt/messenger-app}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BUILD_SERVICES="${BUILD_SERVICES:-web backend edge}"
ENABLE_LOCAL_JITSI="${ENABLE_LOCAL_JITSI:-$(env_file_value ENABLE_LOCAL_JITSI true)}"
APP_MAIL_ENABLED="${APP_MAIL_ENABLED:-$(env_file_value APP_MAIL_ENABLED false)}"
_jitsi_services="jitsi-prosody jitsi-jicofo jitsi-jvb jitsi-web"
_base_services="postgres redis minio"
if [[ "${APP_MAIL_ENABLED,,}" == "true" || "${APP_MAIL_ENABLED}" == "1" ]]; then
  _base_services="$_base_services stalwart"
fi
if [[ "${ENABLE_LOCAL_JITSI,,}" == "true" || "${ENABLE_LOCAL_JITSI}" == "1" ]]; then
  SUPPORT_SERVICES="${SUPPORT_SERVICES:-$_base_services $_jitsi_services}"
else
  SUPPORT_SERVICES="${SUPPORT_SERVICES:-$_base_services}"
fi
RUNTIME_SERVICES="${RUNTIME_SERVICES:-web backend edge}"
OBSERVABILITY_SERVICES="${OBSERVABILITY_SERVICES:-postgres-exporter tempo otel-collector alertmanager loki promtail prometheus grafana}"
DBVIEWER_SERVICES="${DBVIEWER_SERVICES:-pgweb}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-$APP_DIR/.deploy/remote-update.lock}"
DEPLOY_LOCK_WAIT_SECONDS="${DEPLOY_LOCK_WAIT_SECONDS:-1800}"
STATUS_FILE="${DEPLOY_STATUS_FILE:-}"
FULL_RESET="${FULL_RESET:-false}"

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

list_untracked_checkout_files() {
  mapfile -t untracked_files < <(git ls-files --others --exclude-standard)

  for file in "${untracked_files[@]}"; do
    if [[ "$file" == "$ENV_FILE" || "$file" == "./$ENV_FILE" ]]; then
      continue
    fi
    printf "%s\n" "$file"
  done
}

scale_for_service() {
  local service="$1"

  case "$service" in
    backend)
      printf "%s" "$BACKEND_REPLICAS"
      ;;
    web)
      printf "%s" "$WEB_REPLICAS"
      ;;
    *)
      printf "1"
      ;;
  esac
}

wait_for_service_ready() {
  local service="$1"
  local expected_count="$2"
  local timeout_seconds="${3:-240}"
  local sleep_seconds="${4:-2}"
  local deadline=$((SECONDS + timeout_seconds))

  while (( SECONDS < deadline )); do
    mapfile -t container_ids < <("${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q "$service" | sed '/^$/d')

    if (( ${#container_ids[@]} == expected_count )); then
      local ready_count=0

      for container_id in "${container_ids[@]}"; do
        local state
        local health

        state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
        health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)"

        if [[ "$health" == "none" ]]; then
          if [[ "$state" == "running" ]]; then
            ((ready_count+=1))
          fi
        elif [[ "$health" == "healthy" ]]; then
          ((ready_count+=1))
        fi
      done

      if (( ready_count == expected_count )); then
        return 0
      fi
    fi

    sleep "$sleep_seconds"
  done

  echo "Timed out waiting for service '$service' to become ready." >&2
  "${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps "$service" >&2 || true
  "${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=120 "$service" >&2 || true
  exit 1
}

deploy_runtime_service() {
  local service="$1"
  local replicas="$2"
  local up_args=(-f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate)

  if [[ "$service" == "backend" || "$service" == "web" ]]; then
    up_args+=(--scale "${service}=${replicas}")
  fi

  echo "Rolling out ${service} (replicas=${replicas})"
  "${compose_cmd[@]}" "${up_args[@]}" "$service"
  wait_for_service_ready "$service" "$replicas"
}

acquire_deploy_lock() {
  if ! command -v flock >/dev/null 2>&1; then
    echo "Warning: 'flock' is unavailable; continuing without a host-level deploy lock." >&2
    return
  fi

  local lock_dir
  lock_dir="$(dirname "$DEPLOY_LOCK_FILE")"
  mkdir -p "$lock_dir"

  exec 9>"$DEPLOY_LOCK_FILE"
  echo "Waiting for deploy lock: $DEPLOY_LOCK_FILE"

  if ! flock -w "$DEPLOY_LOCK_WAIT_SECONDS" 9; then
    echo "Timed out waiting for deploy lock: $DEPLOY_LOCK_FILE" >&2
    exit 1
  fi

  echo "Acquired deploy lock: $DEPLOY_LOCK_FILE"
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

acquire_deploy_lock

cd "$APP_DIR"

git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1 || true

UNTRACKED_CHECKOUT_FILES="$(list_untracked_checkout_files)"
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$UNTRACKED_CHECKOUT_FILES" ]]; then
  echo "Resetting server checkout to a clean state in $APP_DIR"
  git reset --hard HEAD
  git clean -fd -e "$ENV_FILE"
fi

git fetch origin main
git checkout main
git reset --hard origin/main
WEB_APP_REVISION="$(git rev-parse HEAD)"
export WEB_APP_REVISION

bash "$APP_DIR/deploy/bootstrap-prod-env.sh" "$ENV_FILE"
bash "$APP_DIR/deploy/preflight-prod.sh" "$ENV_FILE"

BACKEND_REPLICAS="${BACKEND_REPLICAS:-$(env_file_value BACKEND_REPLICAS 1)}"
WEB_REPLICAS="${WEB_REPLICAS:-$(env_file_value WEB_REPLICAS 1)}"
ENABLE_OBSERVABILITY_STACK="$(normalize_boolean_flag ENABLE_OBSERVABILITY_STACK "${ENABLE_OBSERVABILITY_STACK:-$(env_file_value ENABLE_OBSERVABILITY_STACK false)}")"
ENABLE_DBVIEWER="$(normalize_boolean_flag ENABLE_DBVIEWER "${ENABLE_DBVIEWER:-$(env_file_value ENABLE_DBVIEWER false)}")"
FULL_RESET="$(normalize_boolean_flag FULL_RESET "$FULL_RESET")"
validate_replica_count BACKEND_REPLICAS "$BACKEND_REPLICAS"
validate_replica_count WEB_REPLICAS "$WEB_REPLICAS"

"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config >/dev/null
if [[ "$FULL_RESET" == "true" ]]; then
  echo "FULL_RESET=true: stopping the stack and removing named volumes for a fresh deployment"
  "${compose_cmd[@]}" \
    --profile observability \
    --profile jibri \
    -f "$COMPOSE_FILE" \
    --env-file "$ENV_FILE" \
    down --volumes --remove-orphans || true
fi
echo "Building web revision: $WEB_APP_REVISION"
DOCKER_BUILDKIT=1 "${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build $BUILD_SERVICES
effective_support_services="$SUPPORT_SERVICES"
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d $effective_support_services
for service in $effective_support_services; do
  wait_for_service_ready "$service" 1 300 2
done
echo "Runtime replicas: backend=${BACKEND_REPLICAS}, web=${WEB_REPLICAS}"

deploy_order=(backend web edge)
declare -A deployed_runtime_services=()

for service in "${deploy_order[@]}"; do
  if [[ " $RUNTIME_SERVICES " == *" $service "* ]]; then
    deploy_runtime_service "$service" "$(scale_for_service "$service")"
    deployed_runtime_services["$service"]=1
  fi
done

for service in $RUNTIME_SERVICES; do
  if [[ -n "${deployed_runtime_services[$service]:-}" ]]; then
    continue
  fi

  deploy_runtime_service "$service" "$(scale_for_service "$service")"
done

if [[ "$ENABLE_DBVIEWER" == "true" ]]; then
  echo "DB viewer: enabled"
  "${compose_cmd[@]}" --profile dbviewer -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate $DBVIEWER_SERVICES
else
  echo "DB viewer: disabled"
  "${compose_cmd[@]}" --profile dbviewer -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop $DBVIEWER_SERVICES >/dev/null 2>&1 || true
  "${compose_cmd[@]}" --profile dbviewer -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f $DBVIEWER_SERVICES >/dev/null 2>&1 || true
fi

if [[ "$ENABLE_OBSERVABILITY_STACK" == "true" ]]; then
  echo "Observability stack: enabled"
  "${compose_cmd[@]}" --profile observability -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate $OBSERVABILITY_SERVICES
else
  echo "Observability stack: disabled"
  "${compose_cmd[@]}" --profile observability -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop $OBSERVABILITY_SERVICES >/dev/null 2>&1 || true
  "${compose_cmd[@]}" --profile observability -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f $OBSERVABILITY_SERVICES >/dev/null 2>&1 || true
fi

"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
