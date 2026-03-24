create table user_chat_drafts (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    content varchar(2000) not null,
    updated_at timestamp with time zone not null,
    constraint uk_user_chat_drafts_user_chat unique (user_id, chat_id)
);

create index idx_user_chat_drafts_user_id
    on user_chat_drafts (user_id);

create index idx_user_chat_drafts_chat_id
    on user_chat_drafts (chat_id);
