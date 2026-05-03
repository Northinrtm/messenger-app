#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/messenger-app}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
LIMIT="${LIMIT:-30}"
CHAT_ID=""
MESSAGE_ID=""

usage() {
  cat >&2 <<'USAGE'
Usage:
  deploy/e2ee-coverage-diagnostic.sh --chat-id <uuid> [--message-id <uuid>] [--limit <n>]

Environment overrides:
  APP_DIR=/opt/messenger-app
  COMPOSE_FILE=docker-compose.prod.yml
  ENV_FILE=.env.prod
  POSTGRES_SERVICE=postgres

This script prints E2EE metadata only. It does not read, decrypt, or print message plaintext.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="${2:-}"
      shift 2
      ;;
    --chat-id)
      CHAT_ID="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --limit)
      LIMIT="${2:-}"
      shift 2
      ;;
    --message-id)
      MESSAGE_ID="${2:-}"
      shift 2
      ;;
    --postgres-service)
      POSTGRES_SERVICE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$CHAT_ID" ]]; then
  echo "--chat-id is required." >&2
  usage
  exit 2
fi

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]] || [[ "$LIMIT" -lt 1 || "$LIMIT" -gt 200 ]]; then
  echo "--limit must be an integer between 1 and 200." >&2
  exit 2
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
"${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config >/dev/null

postgres_container_id="$("${compose_cmd[@]}" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q "$POSTGRES_SERVICE")"
if [[ -z "$postgres_container_id" ]]; then
  echo "Postgres service '$POSTGRES_SERVICE' is not running." >&2
  exit 1
fi

echo "E2EE coverage diagnostic"
echo "chat_id=$CHAT_ID"
if [[ -n "$MESSAGE_ID" ]]; then
  echo "message_id=$MESSAGE_ID"
fi
echo

docker exec -i "$postgres_container_id" psql -U messenger -d messenger \
  -v ON_ERROR_STOP=1 \
  -v chat_id="$CHAT_ID" \
  -v message_id="$MESSAGE_ID" \
  -v message_limit="$LIMIT" \
  -P pager=off <<'SQL'
\pset null '(null)'

\echo '== Chat =='
select r.id as chat_id,
       r.title,
       r.is_direct,
       to_char(r.created_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as created_msk,
       count(distinct p.user_id) as participants,
       count(distinct m.id) as messages,
       count(distinct hk.id) as history_keys
from chat_rooms r
left join chat_participants p on p.chat_id = r.id
left join chat_messages m on m.chat_id = r.id
left join chat_history_keys hk on hk.chat_id = r.id
where r.id = :'chat_id'::uuid
group by r.id, r.title, r.is_direct, r.created_at;

\echo ''
\echo '== Participants And Account Keys =='
select u.username,
       u.display_name,
       to_char(p.joined_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as joined_msk,
       (account_key.public_key is not null and length(account_key.public_key) > 0) as has_account_key,
       snapshot.wrapped_password_version,
       to_char(snapshot.updated_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as snapshot_updated_msk
from chat_participants p
join app_users u on u.id = p.user_id
left join user_encryption_account_keys account_key on account_key.user_id = u.id
left join user_encryption_recovery_snapshots snapshot on snapshot.user_id = u.id
where p.chat_id = :'chat_id'::uuid
order by p.joined_at, u.username;

\echo ''
\echo '== Messages =='
with selected_messages as (
  select m.*
  from chat_messages m
  where m.chat_id = :'chat_id'::uuid
    and (nullif(:'message_id', '') is null or m.id = nullif(:'message_id', '')::uuid)
  order by m.created_at desc
  limit :message_limit
)
select m.id,
       to_char(m.created_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as created_msk,
       sender.username as sender,
       m.encryption_scheme,
       m.content is not null and length(m.content) > 0 as has_shared_envelope,
       m.history_key_id is not null as has_history_key,
       left(coalesce(m.history_key_id::text, ''), 8) as history_key_short,
       left(coalesce(m.reply_to_message_id::text, ''), 8) as reply_to_short
from selected_messages m
join app_users sender on sender.id = m.sender_id
order by m.created_at desc;

\echo ''
\echo '== Missing Coverage Summary =='
with participant_users as (
  select p.chat_id,
         p.joined_at,
         u.id as user_id,
         u.username
  from chat_participants p
  join app_users u on u.id = p.user_id
  where p.chat_id = :'chat_id'::uuid
), selected_messages as (
  select m.*
  from chat_messages m
  where m.chat_id = :'chat_id'::uuid
    and (nullif(:'message_id', '') is null or m.id = nullif(:'message_id', '')::uuid)
  order by m.created_at desc
  limit :message_limit
), history_access as (
  select history_key_id, recipient_user_id
  from chat_history_key_user_access
), coverage as (
  select m.id as message_id,
         m.created_at,
         sender.username as sender,
         pu.username as recipient,
         pu.joined_at,
         (m.sender_id = pu.user_id) as is_sender,
         (m.history_key_id is not null) as has_history_key,
         (ha.recipient_user_id is not null) as has_history_access
  from selected_messages m
  join app_users sender on sender.id = m.sender_id
  cross join participant_users pu
  left join history_access ha on ha.history_key_id = m.history_key_id and ha.recipient_user_id = pu.user_id
)
select left(message_id::text, 8) as msg,
       to_char(created_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as created_msk,
       sender,
       count(*) as participants,
       count(*) filter (where is_sender) as sender_rows,
       count(*) filter (where has_history_key and has_history_access) as history_covered,
       count(*) filter (where not (is_sender or (has_history_key and has_history_access))) as missing_users,
       string_agg(
         recipient || case when joined_at > created_at then ':joined_after' else '' end,
         ', '
         order by recipient
       ) filter (where not (is_sender or (has_history_key and has_history_access))) as missing
from coverage
group by message_id, created_at, sender
order by created_at desc;

\echo ''
\echo '== Per-User Coverage =='
with participant_users as (
  select p.chat_id,
         p.joined_at,
         u.id as user_id,
         u.username
  from chat_participants p
  join app_users u on u.id = p.user_id
  where p.chat_id = :'chat_id'::uuid
), selected_messages as (
  select m.*
  from chat_messages m
  where m.chat_id = :'chat_id'::uuid
    and (nullif(:'message_id', '') is null or m.id = nullif(:'message_id', '')::uuid)
  order by m.created_at desc
  limit :message_limit
), history_access as (
  select history_key_id, recipient_user_id
  from chat_history_key_user_access
)
select left(m.id::text, 8) as msg,
       to_char(m.created_at at time zone 'Europe/Moscow', 'HH24:MI:SS') as time_msk,
       sender.username as sender,
       pu.username as recipient,
       pu.joined_at > m.created_at as joined_after_message,
       (m.sender_id = pu.user_id) as is_sender,
       (m.history_key_id is not null) as has_history_key,
       (ha.recipient_user_id is not null) as has_history_access,
       ((m.sender_id = pu.user_id) or (
         m.history_key_id is not null and ha.recipient_user_id is not null
       )) as can_read
from selected_messages m
join app_users sender on sender.id = m.sender_id
cross join participant_users pu
left join history_access ha on ha.history_key_id = m.history_key_id and ha.recipient_user_id = pu.user_id
order by m.created_at desc, pu.username;

\echo ''
\echo '== History Keys =='
select left(h.id::text, 8) as history_key,
       to_char(h.created_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as created_msk,
       creator.username as created_by,
       count(a.id) as grants,
       count(e.id) as escrow_records,
       string_agg(distinct u.username, ', ' order by u.username) as granted_users
from chat_history_keys h
join app_users creator on creator.id = h.created_by_user_id
left join chat_history_key_user_access a on a.history_key_id = h.id
left join app_users u on u.id = a.recipient_user_id
left join chat_history_key_escrow e on e.history_key_id = h.id
where h.chat_id = :'chat_id'::uuid
group by h.id, h.created_at, creator.username
order by h.created_at desc;

\echo ''
\echo '== Backfill Status =='
select recipient.username as recipient,
       status.state,
       status.required_history_key_count,
       status.granted_history_key_count,
       grantor.username as primary_grantor,
       to_char(status.joined_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as joined_msk,
       to_char(status.completed_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as completed_msk
from chat_history_backfill_status status
join app_users recipient on recipient.id = status.recipient_user_id
left join app_users grantor on grantor.id = status.primary_grantor_user_id
where status.chat_id = :'chat_id'::uuid
order by status.joined_at, recipient.username;
SQL
