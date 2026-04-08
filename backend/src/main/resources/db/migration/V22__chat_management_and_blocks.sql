alter table chat_rooms
    add column owner_user_id uuid references app_users(id) on delete set null;

update chat_rooms room
set owner_user_id = membership.user_id
from (
    select distinct on (participant.chat_id)
        participant.chat_id,
        participant.user_id
    from chat_participants participant
    join chat_rooms candidate on candidate.id = participant.chat_id
    where candidate.is_direct = false
    order by participant.chat_id, participant.joined_at asc, participant.id asc
) membership
where room.id = membership.chat_id
  and room.is_direct = false;

create table chat_room_bans (
    id uuid primary key,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    created_by_user_id uuid not null references app_users(id) on delete cascade,
    created_at timestamp with time zone not null,
    constraint uk_chat_room_ban unique (chat_id, user_id)
);

create index idx_chat_room_bans_chat_id on chat_room_bans (chat_id);

create table user_blocks (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    blocked_user_id uuid not null references app_users(id) on delete cascade,
    created_at timestamp with time zone not null,
    constraint uk_user_block unique (user_id, blocked_user_id)
);

create index idx_user_blocks_user_id on user_blocks (user_id);
