#!/usr/bin/env bash
set -euo pipefail

MINIO_RELEASE="${MINIO_RELEASE:-RELEASE.2025-02-03T21-03-04Z}"
TARGET_DIR="${1:-deploy/minio/bin}"
TARGET_PATH="$TARGET_DIR/minio"
DOWNLOAD_URL="https://github.com/minio/minio/releases/download/${MINIO_RELEASE}/minio.linux-amd64.${MINIO_RELEASE}"

mkdir -p "$TARGET_DIR"

tmp_path="${TARGET_PATH}.tmp"
curl -4fsSLo "$tmp_path" \
  --retry 5 \
  --retry-all-errors \
  --connect-timeout 60 \
  --max-time 900 \
  "$DOWNLOAD_URL"
chmod +x "$tmp_path"
mv "$tmp_path" "$TARGET_PATH"

echo "Fetched MinIO binary to $TARGET_PATH"
