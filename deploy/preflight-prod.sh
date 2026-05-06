#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"

env_file_value() {
  local key="$1"
  local default_value="${2:-}"
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

normalize_boolean() {
  local value="${1,,}"
  case "$value" in
    true|1|yes|on) printf "true" ;;
    false|0|no|off|"") printf "false" ;;
    *)
      echo "Invalid boolean value: '$1'" >&2
      exit 1
      ;;
  esac
}

require_value() {
  local key="$1"
  local value
  value="$(env_file_value "$key")"
  if [[ -z "$value" ]]; then
    echo "Missing required .env value: $key" >&2
    exit 1
  fi
}

require_url() {
  local key="$1"
  local value
  value="$(env_file_value "$key")"
  if [[ -z "$value" ]]; then
    echo "Missing required URL .env value: $key" >&2
    exit 1
  fi
  if [[ ! "$value" =~ ^https?:// ]]; then
    echo "$key must be an absolute http(s) URL, got '$value'" >&2
    exit 1
  fi
}

require_positive_integer() {
  local key="$1"
  local value
  value="$(env_file_value "$key")"
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "$key must be a positive integer, got '$value'" >&2
    exit 1
  fi
}

ENV_BASENAME="$(basename "$ENV_FILE")"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

require_value POSTGRES_PASSWORD
require_value DB_PASSWORD
require_value APP_DOMAIN
require_value APP_CORS_ALLOWED_ORIGINS
require_value APP_JWT_SECRET
require_value APP_REALTIME_REDIS_MAC_SECRET
require_positive_integer BACKEND_REPLICAS
require_positive_integer WEB_REPLICAS
require_value JITSI_PUBLIC_URL
require_value JITSI_ADVERTISE_IPS
require_value JITSI_JICOFO_COMPONENT_SECRET
require_value JITSI_JICOFO_AUTH_PASSWORD
require_value JITSI_JVB_AUTH_PASSWORD
require_value JITSI_JIBRI_RECORDER_PASSWORD
require_value JITSI_JIBRI_XMPP_PASSWORD

ESCROW_PROVIDER="$(env_file_value APP_E2EE_ESCROW_PROVIDER local)"
case "$ESCROW_PROVIDER" in
  local)
    require_value APP_E2EE_ESCROW_SECRET
    ;;
  vault-transit)
    require_url APP_E2EE_ESCROW_VAULT_ADDRESS
    require_value APP_E2EE_ESCROW_VAULT_TOKEN
    require_value APP_E2EE_ESCROW_VAULT_MOUNT_PATH
    require_value APP_E2EE_ESCROW_VAULT_KEY_NAME
    ;;
  *)
    echo "APP_E2EE_ESCROW_PROVIDER must be 'local' or 'vault-transit', got '$ESCROW_PROVIDER'" >&2
    exit 1
    ;;
esac

PUSH_ENABLED="$(normalize_boolean "$(env_file_value APP_PUSH_ENABLED true)")"
if [[ "$PUSH_ENABLED" == "true" ]]; then
  require_value APP_PUSH_SUBJECT
  require_value APP_PUSH_VAPID_PUBLIC_KEY
  require_value APP_PUSH_VAPID_PRIVATE_KEY
fi

EMAIL_VERIFICATION_ENABLED="$(normalize_boolean "$(env_file_value APP_AUTH_EMAIL_VERIFICATION_ENABLED true)")"
if [[ "$EMAIL_VERIFICATION_ENABLED" == "true" ]]; then
  require_value SPRING_MAIL_HOST
  require_url APP_AUTH_EMAIL_VERIFICATION_URL_BASE
  require_value APP_AUTH_EMAIL_VERIFICATION_FROM_ADDRESS
fi

PASSWORD_RESET_ENABLED="$(normalize_boolean "$(env_file_value APP_AUTH_PASSWORD_RESET_ENABLED true)")"
if [[ "$PASSWORD_RESET_ENABLED" == "true" ]]; then
  require_value SPRING_MAIL_HOST
  require_url APP_AUTH_PASSWORD_RESET_URL_BASE
  require_value APP_AUTH_PASSWORD_RESET_FROM_ADDRESS
fi

ENABLE_OBSERVABILITY_STACK="$(normalize_boolean "$(env_file_value ENABLE_OBSERVABILITY_STACK false)")"
if [[ "$ENABLE_OBSERVABILITY_STACK" == "true" ]]; then
  require_value GRAFANA_ADMIN_USER
  require_value GRAFANA_ADMIN_PASSWORD
  require_value APP_ACTUATOR_SCRAPE_USERNAME
  require_value APP_ACTUATOR_SCRAPE_PASSWORD
fi

APP_REALTIME_REDIS_ENABLED="$(normalize_boolean "$(env_file_value APP_REALTIME_REDIS_ENABLED true)")"
APP_AUTH_RATE_LIMIT_REDIS_ENABLED="$(normalize_boolean "$(env_file_value APP_AUTH_RATE_LIMIT_REDIS_ENABLED true)")"
BACKEND_REPLICAS="$(env_file_value BACKEND_REPLICAS)"
if [[ "$BACKEND_REPLICAS" =~ ^[0-9]+$ ]] && (( BACKEND_REPLICAS > 1 )); then
  if [[ "$APP_REALTIME_REDIS_ENABLED" != "true" ]]; then
    echo "APP_REALTIME_REDIS_ENABLED must be true when BACKEND_REPLICAS > 1" >&2
    exit 1
  fi
  if [[ "$APP_AUTH_RATE_LIMIT_REDIS_ENABLED" != "true" ]]; then
    echo "APP_AUTH_RATE_LIMIT_REDIS_ENABLED must be true when BACKEND_REPLICAS > 1" >&2
    exit 1
  fi
fi

echo "Production preflight passed for $ENV_BASENAME"
