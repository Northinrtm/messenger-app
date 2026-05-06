#!/usr/bin/env bash
set -euo pipefail

: "${VAULT_ADDR:?VAULT_ADDR must be set}"
: "${VAULT_TOKEN:?VAULT_TOKEN must be set}"

TRANSIT_MOUNT_PATH="${APP_E2EE_ESCROW_VAULT_MOUNT_PATH:-transit}"
TRANSIT_KEY_NAME="${APP_E2EE_ESCROW_VAULT_KEY_NAME:-messenger-history-escrow}"

headers=(
  -H "X-Vault-Token: ${VAULT_TOKEN}"
  -H "Content-Type: application/json"
)

if [[ -n "${VAULT_NAMESPACE:-}" ]]; then
  headers+=(-H "X-Vault-Namespace: ${VAULT_NAMESPACE}")
fi

curl -fsS "${headers[@]}" \
  --request POST \
  "${VAULT_ADDR%/}/v1/sys/mounts/${TRANSIT_MOUNT_PATH}" \
  --data '{"type":"transit"}' >/dev/null || true

curl -fsS "${headers[@]}" \
  --request POST \
  "${VAULT_ADDR%/}/v1/${TRANSIT_MOUNT_PATH}/keys/${TRANSIT_KEY_NAME}" \
  --data '{"type":"aes256-gcm96","deletion_allowed":false,"exportable":false}' >/dev/null || true

echo "Vault transit mount '${TRANSIT_MOUNT_PATH}' and key '${TRANSIT_KEY_NAME}' are ready."
