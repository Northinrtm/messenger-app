#!/usr/bin/env bash
set -euo pipefail

umask 077

APP_DIR="${APP_DIR:-/opt/messenger-app}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/messenger-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_VOLUME_SUFFIXES="${BACKUP_VOLUME_SUFFIXES:-caddy_data conference_recordings_archive conference_recordings_raw message_attachments vault_data}"
BACKUP_ARCHIVER_IMAGE="${BACKUP_ARCHIVER_IMAGE:-caddy:2.9-alpine}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"

if docker compose version >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

lock_file="$BACKUP_ROOT/.backup.lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "Backup is already running." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp_dir="$BACKUP_ROOT/.tmp-$timestamp"
final_dir="$BACKUP_ROOT/$timestamp"

cleanup() {
  local status=$?
  if [[ $status -ne 0 && -d "$tmp_dir" ]]; then
    rm -rf "$tmp_dir"
  fi
}
trap cleanup EXIT

cd "$APP_DIR"
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config >/dev/null

if ! docker image inspect "$BACKUP_ARCHIVER_IMAGE" >/dev/null 2>&1; then
  echo "Required backup archiver image '$BACKUP_ARCHIVER_IMAGE' is not available locally." >&2
  exit 1
fi

mkdir -p "$tmp_dir"

postgres_container_id="$("${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q "$POSTGRES_SERVICE")"
if [[ -z "$postgres_container_id" ]]; then
  echo "Postgres service '$POSTGRES_SERVICE' is not running." >&2
  exit 1
fi

docker exec "$postgres_container_id" sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$tmp_dir/postgres.dump"

docker exec "$postgres_container_id" sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dumpall --globals-only -U "$POSTGRES_USER"' \
  | gzip -9 > "$tmp_dir/postgres-globals.sql.gz"

config_paths=()
for path in "$ENV_FILE" "$COMPOSE_FILE" deploy/Caddyfile; do
  if [[ -e "$APP_DIR/$path" ]]; then
    config_paths+=("$path")
  fi
done

if [[ ${#config_paths[@]} -gt 0 ]]; then
  tar -czf "$tmp_dir/config.tar.gz" -C "$APP_DIR" "${config_paths[@]}"
fi

printf "%s\n" "$timestamp" > "$tmp_dir/created-at.txt"
git -C "$APP_DIR" rev-parse HEAD > "$tmp_dir/git-revision.txt" 2>/dev/null || true
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps > "$tmp_dir/compose-ps.txt"

compose_project_name="${COMPOSE_PROJECT_NAME:-$(basename "$APP_DIR")}"
{
  printf "project=%s\n" "$compose_project_name"
  printf "postgres_service=%s\n" "$POSTGRES_SERVICE"
  printf "archiver_image=%s\n" "$BACKUP_ARCHIVER_IMAGE"
  printf "volume_suffixes=%s\n" "$BACKUP_VOLUME_SUFFIXES"
} > "$tmp_dir/metadata.txt"

for suffix in $BACKUP_VOLUME_SUFFIXES; do
  volume_name="${compose_project_name}_${suffix}"
  if docker volume inspect "$volume_name" >/dev/null 2>&1; then
    docker run --rm \
      -v "${volume_name}:/source:ro" \
      --entrypoint sh \
      "$BACKUP_ARCHIVER_IMAGE" \
      -lc 'tar -C /source -czf - .' \
      > "$tmp_dir/volume-${suffix}.tar.gz"
  fi
done

mv "$tmp_dir" "$final_dir"
ln -sfn "$timestamp" "$BACKUP_ROOT/latest"

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$BACKUP_RETENTION_DAYS" -exec rm -rf -- {} +
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.tmp-*' -mtime +1 -exec rm -rf -- {} +

du -sh "$final_dir"
