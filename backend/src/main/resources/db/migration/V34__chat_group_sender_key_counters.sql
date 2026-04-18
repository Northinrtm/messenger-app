create table if not exists chat_group_sender_key_counters (
    id uuid primary key,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    sender_device_id uuid not null references user_encryption_devices(id) on delete cascade,
    sender_key_id text not null,
    last_message_counter integer not null,
    updated_at timestamptz not null
);

create unique index if not exists uq_chat_group_sender_key_counters_chain
    on chat_group_sender_key_counters (chat_id, sender_device_id, sender_key_id);
