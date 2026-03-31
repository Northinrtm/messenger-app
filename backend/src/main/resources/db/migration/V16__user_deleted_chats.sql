create table user_deleted_chats (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    deleted_at timestamp with time zone not null,
    constraint uk_user_deleted_chats_user_chat unique (user_id, chat_id)
);

create index idx_user_deleted_chats_user_id_deleted_at
    on user_deleted_chats (user_id, deleted_at desc);
