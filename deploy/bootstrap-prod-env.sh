#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.prod}"
PUBLIC_BASE_URL="${PROD_PUBLIC_BASE_URL:-https://pishi.ktsf.ru}"
PUBLIC_IP="${PROD_PUBLIC_IP:-}"

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

replace_or_append_env_value() {
  local key="$1"
  local value="$2"
  local escaped_value="${value//\\/\\\\}"
  escaped_value="${escaped_value//&/\\&}"

  if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s~^[[:space:]]*${key}=.*\$~${key}=${escaped_value}~" "$ENV_FILE"
  else
    printf "%s=%s\n" "$key" "$value" >> "$ENV_FILE"
  fi
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  local current
  current="$(env_file_value "$key")"
  if [[ -n "$current" ]]; then
    return
  fi
  replace_or_append_env_value "$key" "$value"
}

random_base64_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\r\n'
    return
  fi

  head -c 32 /dev/urandom | base64 | tr -d '\r\n'
}

random_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
    return
  fi

  head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp .env.prod.example "$ENV_FILE"
fi

normalized_base_url="${PUBLIC_BASE_URL%/}"
base_url_no_scheme="${normalized_base_url#http://}"
base_url_no_scheme="${base_url_no_scheme#https://}"
app_domain="${base_url_no_scheme%%/*}"

if [[ -z "$PUBLIC_IP" ]]; then
  if [[ "$app_domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PUBLIC_IP="$app_domain"
  else
    PUBLIC_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
fi

db_password="$(env_file_value DB_PASSWORD)"
postgres_password="$(env_file_value POSTGRES_PASSWORD)"
if [[ -z "$db_password" && -n "$postgres_password" ]]; then
  db_password="$postgres_password"
elif [[ -z "$postgres_password" && -n "$db_password" ]]; then
  postgres_password="$db_password"
elif [[ -z "$db_password" && -z "$postgres_password" ]]; then
  db_password="$(random_base64_secret)"
  postgres_password="$db_password"
fi

ensure_env_value POSTGRES_PASSWORD "$postgres_password"
ensure_env_value DB_PASSWORD "$db_password"
ensure_env_value APP_DOMAIN "$app_domain"
ensure_env_value APP_CORS_ALLOWED_ORIGINS "$normalized_base_url"
ensure_env_value APP_JWT_SECRET "$(random_base64_secret)"
ensure_env_value APP_REALTIME_REDIS_MAC_SECRET "$(random_base64_secret)"
ensure_env_value BACKEND_REPLICAS "1"
ensure_env_value WEB_REPLICAS "1"
ensure_env_value APP_E2EE_ESCROW_PROVIDER "local"

if [[ "$(env_file_value APP_E2EE_ESCROW_PROVIDER local)" == "local" ]]; then
  ensure_env_value APP_E2EE_ESCROW_SECRET "$(random_base64_secret)"
fi

ensure_env_value APP_PUSH_ENABLED "false"
ensure_env_value APP_AUTH_EMAIL_VERIFICATION_ENABLED "false"
ensure_env_value APP_AUTH_PASSWORD_RESET_ENABLED "false"
ensure_env_value ENABLE_OBSERVABILITY_STACK "false"
ensure_env_value MANAGEMENT_TRACING_ENABLED "false"
ensure_env_value JITSI_PUBLIC_URL "${normalized_base_url}/meet"
ensure_env_value JITSI_ADVERTISE_IPS "$PUBLIC_IP"
ensure_env_value JITSI_JICOFO_COMPONENT_SECRET "$(random_token)"
ensure_env_value JITSI_JICOFO_AUTH_PASSWORD "$(random_token)"
ensure_env_value JITSI_JVB_AUTH_PASSWORD "$(random_token)"
ensure_env_value JITSI_JIBRI_RECORDER_PASSWORD "$(random_token)"
ensure_env_value JITSI_JIBRI_XMPP_PASSWORD "$(random_token)"
ensure_env_value TZ "Europe/Moscow"

echo "Production env bootstrap ensured for $(basename "$ENV_FILE")"
