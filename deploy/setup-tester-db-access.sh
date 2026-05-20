#!/usr/bin/env bash
# Creates a read-only 'tester' PostgreSQL user on the production server.
# Usage: PROD_SSH_HOST=host TESTER_DB_PASSWORD=secret ./setup-tester-db-access.sh
set -euo pipefail

PROD_SSH_HOST="${PROD_SSH_HOST:?PROD_SSH_HOST is required}"
PROD_SSH_PORT="${PROD_SSH_PORT:-22}"
PROD_SSH_USER="${PROD_SSH_USER:-deploy}"
TESTER_DB_PASSWORD="${TESTER_DB_PASSWORD:?TESTER_DB_PASSWORD is required}"
PG_CONTAINER="${PG_CONTAINER:-messenger-postgres}"
PG_USER="${PG_USER:-messenger}"
PG_DB="${PG_DB:-messenger}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_SRC="$SCRIPT_DIR/create-tester-db-user.sql"
REMOTE_SQL="/tmp/create-tester-db-user.sql"
USER_HOST="${PROD_SSH_USER}@${PROD_SSH_HOST}"

echo "Uploading SQL script to $USER_HOST"
scp \
  -P "$PROD_SSH_PORT" \
  -o ServerAliveInterval=30 \
  "$SQL_SRC" \
  "${USER_HOST}:${REMOTE_SQL}"

echo "Applying script on remote host"
# shellcheck disable=SC2087
ssh \
  -p "$PROD_SSH_PORT" \
  -o ServerAliveInterval=30 \
  "$USER_HOST" <<EOF
set -euo pipefail
sed -i "s/__TESTER_PASSWORD__/$(printf '%s' "$TESTER_DB_PASSWORD" | sed 's/[\/&]/\\\\&/g')/" "$REMOTE_SQL"
docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" < "$REMOTE_SQL"
rm -f "$REMOTE_SQL"
EOF

echo "Done. Tester user created with SELECT-only access to all tables in the messenger database."
echo ""
echo "--- Connection details for tester ---"
echo "Host:     <server IP>  (via SSH tunnel: ssh -L 5432:127.0.0.1:5432 ${USER_HOST} -p ${PROD_SSH_PORT})"
echo "Port:     5432"
echo "Database: $PG_DB"
echo "Username: tester"
echo "Password: (the TESTER_DB_PASSWORD you provided)"
