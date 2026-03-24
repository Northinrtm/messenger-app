create table user_contacts (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    contact_user_id uuid not null references app_users(id) on delete cascade,
    created_at timestamp with time zone not null,
    constraint uk_user_contacts_user_contact unique (user_id, contact_user_id),
    constraint chk_user_contacts_not_self check (user_id <> contact_user_id)
);

create index idx_user_contacts_user_id_created_at
    on user_contacts (user_id, created_at desc);

create table user_archived_chats (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    archived_at timestamp with time zone not null,
    constraint uk_user_archived_chats_user_chat unique (user_id, chat_id)
);

create index idx_user_archived_chats_user_id_archived_at
    on user_archived_chats (user_id, archived_at desc);
