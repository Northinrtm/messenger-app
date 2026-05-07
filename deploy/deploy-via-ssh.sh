#!/usr/bin/env bash
set -euo pipefail

PROD_SSH_HOST="${PROD_SSH_HOST:?PROD_SSH_HOST is required}"
PROD_SSH_PORT="${PROD_SSH_PORT:-22}"
PROD_SSH_USER="${PROD_SSH_USER:-deploy}"
PROD_APP_DIR="${PROD_APP_DIR:-/opt/messenger-app}"
PROD_PUBLIC_BASE_URL="${PROD_PUBLIC_BASE_URL:?PROD_PUBLIC_BASE_URL is required}"
FULL_RESET="${FULL_RESET:-false}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_SCRIPT="/tmp/messenger-remote-update.sh"
REMOTE_LOG="/tmp/messenger-remote-update.log"
REMOTE_EXIT="/tmp/messenger-remote-update.exit"
USER_HOST="${PROD_SSH_USER}@${PROD_SSH_HOST}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command was not found in PATH: $1" >&2
    exit 1
  fi
}

quote_for_sh() {
  printf "'%s'" "${1//\'/\'\"\'\"\'}"
}

invoke_ssh() {
  ssh \
    -p "$PROD_SSH_PORT" \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=10 \
    "$USER_HOST" \
    "$1"
}

wait_remote_deploy() {
  local attempts="${1:-330}"
  local wait_seconds="${2:-10}"
  local quoted_remote_log
  local quoted_remote_exit
  local status_prefix="__STATUS__:"

  quoted_remote_log="$(quote_for_sh "$REMOTE_LOG")"
  quoted_remote_exit="$(quote_for_sh "$REMOTE_EXIT")"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    local output
    output="$(
      invoke_ssh \
        "status=''; if [ -f $quoted_remote_exit ]; then status=\$(cat $quoted_remote_exit); fi; echo \"$status_prefix\$status\"; tail -n 60 $quoted_remote_log 2>/dev/null || true"
    )"
    printf '%s\n' "$output"

    local status_line
    status_line="$(printf '%s\n' "$output" | grep "^$status_prefix" | tail -n 1 || true)"
    local status_value="${status_line#"$status_prefix"}"
    if [[ -n "$status_value" ]]; then
      if [[ "$status_value" != "0" ]]; then
        echo "Remote deployment failed with exit code $status_value" >&2
        exit 1
      fi
      return 0
    fi

    sleep "$wait_seconds"
  done

  echo "Timed out waiting for remote deployment to finish" >&2
  exit 1
}

verify_public_revision() {
  local attempts="${1:-18}"
  local wait_seconds="${2:-10}"
  local quoted_app_dir
  local expected_revision
  local base_url

  quoted_app_dir="$(quote_for_sh "$PROD_APP_DIR")"
  expected_revision="$(invoke_ssh "cd $quoted_app_dir && git rev-parse HEAD" | tail -n 1 | tr -d '\r')"
  if [[ -z "$expected_revision" ]]; then
    echo "Could not resolve deployed revision on the server" >&2
    exit 1
  fi

  base_url="${PROD_PUBLIC_BASE_URL%/}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    local payload
    if payload="$(curl -fsSL --max-time 20 "$base_url/build-meta.json" 2>/dev/null)"; then
      local public_revision
      local built_at
      public_revision="$(
        printf '%s' "$payload" |
          python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get("revision",""))'
      )"
      built_at="$(
        printf '%s' "$payload" |
          python3 -c 'import json,sys; data=json.load(sys.stdin); print(data.get("builtAt",""))'
      )"

      if [[ -n "$public_revision" && "$public_revision" == "$expected_revision" ]]; then
        echo "Verified public revision $public_revision built at $built_at"
        return 0
      fi
    else
      echo "Public revision check attempt $attempt/$attempts is not ready yet."
    fi

    sleep "$wait_seconds"
  done

  echo "Public deployment never exposed revision $expected_revision" >&2
  exit 1
}

main() {
  require_command ssh
  require_command scp
  require_command curl
  require_command python3

  local local_remote_update_script="$SCRIPT_DIR/remote-update.sh"
  if [[ ! -f "$local_remote_update_script" ]]; then
    echo "Local deploy helper was not found: $local_remote_update_script" >&2
    exit 1
  fi

  echo "Uploading deploy script to $USER_HOST"
  scp \
    -P "$PROD_SSH_PORT" \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=10 \
    "$local_remote_update_script" \
    "${USER_HOST}:${REMOTE_SCRIPT}"

  local quoted_remote_script
  local quoted_remote_log
  local quoted_remote_exit
  local quoted_public_base_url
  local quoted_public_ip
  local quoted_app_dir
  local quoted_full_reset
  local launch_command

  quoted_remote_script="$(quote_for_sh "$REMOTE_SCRIPT")"
  quoted_remote_log="$(quote_for_sh "$REMOTE_LOG")"
  quoted_remote_exit="$(quote_for_sh "$REMOTE_EXIT")"
  quoted_public_base_url="$(quote_for_sh "$PROD_PUBLIC_BASE_URL")"
  quoted_public_ip="$(quote_for_sh "$PROD_SSH_HOST")"
  quoted_app_dir="$(quote_for_sh "$PROD_APP_DIR")"
  quoted_full_reset="$(quote_for_sh "$FULL_RESET")"

  launch_command="rm -f $quoted_remote_log $quoted_remote_exit && chmod +x $quoted_remote_script && nohup env DEPLOY_STATUS_FILE=$quoted_remote_exit PROD_PUBLIC_BASE_URL=$quoted_public_base_url PROD_PUBLIC_IP=$quoted_public_ip FULL_RESET=$quoted_full_reset $quoted_remote_script $quoted_app_dir > $quoted_remote_log 2>&1 </dev/null &"

  echo "Starting remote deployment on $USER_HOST"
  invoke_ssh "$launch_command" >/dev/null

  wait_remote_deploy
  verify_public_revision

  echo "Deployment finished successfully."
}

main "$@"
