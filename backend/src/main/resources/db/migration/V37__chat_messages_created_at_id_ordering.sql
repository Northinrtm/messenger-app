create index if not exists idx_chat_messages_chat_id_created_at_id
    on chat_messages (chat_id, created_at desc, id desc);
