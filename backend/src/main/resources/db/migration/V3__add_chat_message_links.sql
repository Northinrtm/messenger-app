create table chat_message_links (
    id uuid primary key,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    message_id uuid not null references chat_messages(id) on delete cascade,
    url varchar(2048) not null,
    position_index integer not null,
    created_at timestamp with time zone not null,
    constraint uk_chat_message_links_message_position unique (message_id, position_index)
);

create index idx_chat_message_links_chat_message_position
    on chat_message_links (chat_id, message_id, position_index);
