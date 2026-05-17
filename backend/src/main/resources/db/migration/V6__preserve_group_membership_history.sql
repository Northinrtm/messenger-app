alter table chat_participants
    add column left_at timestamp with time zone;

create index idx_chat_participants_chat_id_left_at on chat_participants (chat_id, left_at, joined_at);
