create table chat_room_moderators (
    id uuid primary key,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    created_by_user_id uuid not null references app_users(id) on delete cascade,
    created_at timestamp with time zone not null,
    constraint uk_chat_room_moderator unique (chat_id, user_id)
);

create index idx_chat_room_moderators_chat_id on chat_room_moderators (chat_id);
