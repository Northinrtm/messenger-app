#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/messenger-app}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/messenger-backups}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/messenger-backup.env}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "Deploy user '$DEPLOY_USER' does not exist." >&2
  exit 1
fi

if ! id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx docker; then
  echo "Deploy user '$DEPLOY_USER' must belong to the 'docker' group." >&2
  exit 1
fi

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BACKUP_ROOT"
install -d -m 755 /etc/systemd/system
install -m 0644 "$APP_DIR/deploy/systemd/messenger-backup.service" /etc/systemd/system/messenger-backup.service
install -m 0644 "$APP_DIR/deploy/systemd/messenger-backup.timer" /etc/systemd/system/messenger-backup.timer

if [[ ! -f "$BACKUP_ENV_FILE" ]]; then
  cat > "$BACKUP_ENV_FILE" <<EOF
APP_DIR=$APP_DIR
BACKUP_ROOT=$BACKUP_ROOT
BACKUP_RETENTION_DAYS=14
BACKUP_VOLUME_SUFFIXES="caddy_data conference_recordings_archive conference_recordings_raw minio_data"
BACKUP_ARCHIVER_IMAGE=caddy:2.9-alpine
EOF
  chmod 600 "$BACKUP_ENV_FILE"
fi

systemctl daemon-reload
systemctl enable --now messenger-backup.timer

cat <<EOF
Backup timer installed.
- backup root: $BACKUP_ROOT
- env file: $BACKUP_ENV_FILE

Next:
1. Review $BACKUP_ENV_FILE if you want different retention or volume coverage.
2. Start the first backup with: systemctl start messenger-backup.service
3. Check timer status with: systemctl list-timers messenger-backup.timer
EOF
