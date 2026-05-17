alter table chat_messages
    add column forwarded_at timestamp with time zone,
    add column forwarded_from_sender_id uuid references app_users(id) on delete set null;

create index idx_chat_messages_forwarded_from_sender_id on chat_messages (forwarded_from_sender_id);

create table user_chat_reaction_attentions (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    updated_at timestamp with time zone not null,
    constraint uk_user_chat_reaction_attentions_user_chat unique (user_id, chat_id)
);

create index idx_user_chat_reaction_attentions_user_chat
    on user_chat_reaction_attentions (user_id, chat_id);
