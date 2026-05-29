-- Index for findAllByChatId on user_deleted_chats (used in notifyChatUpdated on every message send)
create index if not exists idx_user_deleted_chats_chat_id
    on user_deleted_chats (chat_id);
