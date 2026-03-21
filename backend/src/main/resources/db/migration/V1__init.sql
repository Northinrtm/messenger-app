create table app_users (
    id uuid primary key,
    username varchar(24) not null unique,
    display_name varchar(40) not null,
    password_hash varchar(255) not null,
    created_at timestamp with time zone not null
);

create table chat_rooms (
    id uuid primary key,
    title varchar(120),
    is_direct boolean not null,
    created_at timestamp with time zone not null
);

create table chat_participants (
    id uuid primary key,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    joined_at timestamp with time zone not null,
    constraint uk_chat_participant unique (chat_id, user_id)
);

create table chat_messages (
    id uuid primary key,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    sender_id uuid not null references app_users(id) on delete cascade,
    content varchar(2000) not null,
    created_at timestamp with time zone not null
);

create index idx_app_users_username on app_users (username);
create index idx_chat_participants_user_id on chat_participants (user_id);
create index idx_chat_messages_chat_id_created_at on chat_messages (chat_id, created_at desc);
