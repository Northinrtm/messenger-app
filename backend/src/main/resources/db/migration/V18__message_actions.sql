alter table chat_messages
    add column reply_to_message_id uuid references chat_messages(id) on delete set null,
    add column edited_at timestamptz;

alter table chat_rooms
    add column pinned_message_id uuid references chat_messages(id) on delete set null,
    add column pinned_at timestamptz;

create table user_deleted_messages (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    message_id uuid not null references chat_messages(id) on delete cascade,
    deleted_at timestamptz not null default now(),
    constraint uk_user_deleted_message unique (user_id, message_id)
);

create index ix_user_deleted_messages_user_id on user_deleted_messages(user_id);
create index ix_user_deleted_messages_message_id on user_deleted_messages(message_id);
