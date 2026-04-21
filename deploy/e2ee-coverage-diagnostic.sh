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
\echo '== Participants And Active Devices =='
with valid_signed_prekeys as (
  select device_id, count(*) as valid_prekeys
  from user_encryption_signed_prekeys
  where retired_at is null
    and (expires_at is null or expires_at > now())
  group by device_id
)
select u.username,
       u.display_name,
       to_char(p.joined_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as joined_msk,
       count(d.id) filter (where d.retired_at is null) as active_devices,
       count(d.id) filter (
         where d.retired_at is null and coalesce(vsp.valid_prekeys, 0) > 0
       ) as active_devices_with_valid_prekey,
       string_agg(
         left(d.id::text, 8) || ':' ||
           coalesce(to_char(d.last_seen_at at time zone 'Europe/Moscow', 'MM-DD HH24:MI'), '?') ||
           case when d.retired_at is null then '' else ':retired' end,
         ', '
         order by d.last_seen_at desc
       ) as devices
from chat_participants p
join app_users u on u.id = p.user_id
left join user_encryption_devices d on d.user_id = u.id
left join valid_signed_prekeys vsp on vsp.device_id = d.id
where p.chat_id = :'chat_id'::uuid
group by u.username, u.display_name, p.joined_at
order by p.joined_at;

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
       coalesce((
         select count(*)
         from jsonb_object_keys(coalesce(nullif(m.encrypted_keys_json, ''), '{}')::jsonb)
       ), 0) as live_key_count,
       m.history_key_id is not null as has_history_key,
       m.history_envelope_json is not null and length(m.history_envelope_json) > 0 as has_history_envelope,
       left(coalesce(m.history_key_id::text, ''), 8) as history_key_short,
       left(coalesce(m.reply_to_message_id::text, ''), 8) as reply_to_short
from selected_messages m
join app_users sender on sender.id = m.sender_id
order by m.created_at desc;

\echo ''
\echo '== Missing Coverage Summary =='
with valid_signed_prekeys as (
  select device_id
  from user_encryption_signed_prekeys
  where retired_at is null
    and (expires_at is null or expires_at > now())
), participant_devices as (
  select p.chat_id,
         p.joined_at,
         u.id as user_id,
         u.username,
         d.id as device_id
  from chat_participants p
  join app_users u on u.id = p.user_id
  join user_encryption_devices d on d.user_id = u.id
  join valid_signed_prekeys vsp on vsp.device_id = d.id
  where p.chat_id = :'chat_id'::uuid
    and d.retired_at is null
), selected_messages as (
  select m.*
  from chat_messages m
  where m.chat_id = :'chat_id'::uuid
    and (nullif(:'message_id', '') is null or m.id = nullif(:'message_id', '')::uuid)
  order by m.created_at desc
  limit :message_limit
), message_live_keys as (
  select m.id as message_id, key::uuid as device_id
  from selected_messages m
  cross join lateral jsonb_object_keys(coalesce(nullif(m.encrypted_keys_json, ''), '{}')::jsonb) as key
), history_access as (
  select history_key_id, recipient_device_id
  from chat_history_key_access
), coverage as (
  select m.id as message_id,
         m.created_at,
         sender.username as sender,
         pd.username as recipient,
         pd.device_id,
         pd.joined_at,
         (mlk.device_id is not null) as has_live_key,
         (m.history_envelope_json is not null and length(m.history_envelope_json) > 0) as has_history_envelope,
         (ha.recipient_device_id is not null) as has_history_access
  from selected_messages m
  join app_users sender on sender.id = m.sender_id
  cross join participant_devices pd
  left join message_live_keys mlk on mlk.message_id = m.id and mlk.device_id = pd.device_id
  left join history_access ha on ha.history_key_id = m.history_key_id and ha.recipient_device_id = pd.device_id
)
select left(message_id::text, 8) as msg,
       to_char(created_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as created_msk,
       sender,
       count(*) as active_devices,
       count(*) filter (where has_live_key) as live_covered,
       count(*) filter (where has_history_envelope and has_history_access) as history_covered,
       count(*) filter (where not (has_live_key or (has_history_envelope and has_history_access))) as missing_devices,
       string_agg(
         recipient || ':' || left(device_id::text, 8) ||
           case when joined_at > created_at then ':joined_after' else '' end,
         ', '
         order by recipient, device_id
       ) filter (where not (has_live_key or (has_history_envelope and has_history_access))) as missing
from coverage
group by message_id, created_at, sender
order by created_at desc;

\echo ''
\echo '== Per-Device Coverage =='
with valid_signed_prekeys as (
  select device_id
  from user_encryption_signed_prekeys
  where retired_at is null
    and (expires_at is null or expires_at > now())
), participant_devices as (
  select p.chat_id,
         p.joined_at,
         u.id as user_id,
         u.username,
         d.id as device_id
  from chat_participants p
  join app_users u on u.id = p.user_id
  join user_encryption_devices d on d.user_id = u.id
  join valid_signed_prekeys vsp on vsp.device_id = d.id
  where p.chat_id = :'chat_id'::uuid
    and d.retired_at is null
), selected_messages as (
  select m.*
  from chat_messages m
  where m.chat_id = :'chat_id'::uuid
    and (nullif(:'message_id', '') is null or m.id = nullif(:'message_id', '')::uuid)
  order by m.created_at desc
  limit :message_limit
), message_live_keys as (
  select m.id as message_id, key::uuid as device_id
  from selected_messages m
  cross join lateral jsonb_object_keys(coalesce(nullif(m.encrypted_keys_json, ''), '{}')::jsonb) as key
), history_access as (
  select history_key_id, recipient_device_id
  from chat_history_key_access
)
select left(m.id::text, 8) as msg,
       to_char(m.created_at at time zone 'Europe/Moscow', 'HH24:MI:SS') as time_msk,
       sender.username as sender,
       pd.username as recipient,
       left(pd.device_id::text, 8) as device,
       pd.joined_at > m.created_at as joined_after_message,
       (mlk.device_id is not null) as has_live_key,
       (m.history_envelope_json is not null and length(m.history_envelope_json) > 0) as has_history_envelope,
       (ha.recipient_device_id is not null) as has_history_access,
       ((mlk.device_id is not null) or (
         m.history_envelope_json is not null and length(m.history_envelope_json) > 0 and ha.recipient_device_id is not null
       )) as can_receive
from selected_messages m
join app_users sender on sender.id = m.sender_id
cross join participant_devices pd
left join message_live_keys mlk on mlk.message_id = m.id and mlk.device_id = pd.device_id
left join history_access ha on ha.history_key_id = m.history_key_id and ha.recipient_device_id = pd.device_id
order by m.created_at desc, pd.username, pd.device_id;

\echo ''
\echo '== History Keys =='
select left(h.id::text, 8) as history_key,
       to_char(h.created_at at time zone 'Europe/Moscow', 'YYYY-MM-DD HH24:MI:SS') as created_msk,
       creator.username as created_by,
       count(a.id) as grants,
       string_agg(distinct u.username, ', ' order by u.username) as granted_users
from chat_history_keys h
join app_users creator on creator.id = h.created_by_user_id
left join chat_history_key_access a on a.history_key_id = h.id
left join app_users u on u.id = a.recipient_user_id
where h.chat_id = :'chat_id'::uuid
group by h.id, h.created_at, creator.username
order by h.created_at desc;
SQL
