create table chat_attachments (
    id uuid primary key,
    chat_id uuid not null references chat_rooms (id) on delete cascade,
    message_id uuid references chat_messages (id) on delete set null,
    uploader_id uuid not null references app_users (id) on delete cascade,
    storage_key varchar(255) not null unique,
    ciphertext_size_bytes bigint not null check (ciphertext_size_bytes > 0),
    created_at timestamptz not null
);

create index idx_chat_attachments_chat_created_at
    on chat_attachments (chat_id, created_at desc);

create index idx_chat_attachments_message
    on chat_attachments (message_id);

create index idx_chat_attachments_uploader
    on chat_attachments (uploader_id, created_at desc);
