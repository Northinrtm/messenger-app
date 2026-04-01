create table message_reactions (
    id uuid primary key,
    message_id uuid not null references chat_messages(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    reaction_key varchar(24) not null,
    created_at timestamptz not null default now()
);

create unique index ux_message_reactions_message_user_key
    on message_reactions(message_id, user_id, reaction_key);

create index ix_message_reactions_message_id
    on message_reactions(message_id);
