alter table chat_rooms
    add column if not exists prejoin_history_policy varchar(24) not null default 'FULL_HISTORY';

alter table chat_participants
    add column if not exists prejoin_history_access_granted_at timestamptz;

create table if not exists chat_history_key_escrow (
    id uuid primary key,
    history_key_id uuid not null references chat_history_keys (id) on delete cascade,
    chat_id uuid not null references chat_rooms (id) on delete cascade,
    encrypted_grant_payload_json text not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create unique index if not exists uq_chat_history_key_escrow_history_key
    on chat_history_key_escrow (history_key_id);

create index if not exists ix_chat_history_key_escrow_chat
    on chat_history_key_escrow (chat_id, created_at desc);

update chat_rooms
set prejoin_history_policy = 'FULL_HISTORY'
where not is_direct;

update chat_participants participant
set prejoin_history_access_granted_at = coalesce(participant.prejoin_history_access_granted_at, participant.joined_at)
where exists (
    select 1
    from chat_rooms room
    where room.id = participant.chat_id
      and not room.is_direct
);
