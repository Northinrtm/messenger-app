create table if not exists chat_history_keys (
    id uuid primary key,
    chat_id uuid not null references chat_rooms (id) on delete cascade,
    created_by_user_id uuid not null references app_users (id) on delete cascade,
    created_at timestamptz not null
);

create index if not exists ix_chat_history_keys_chat_created_at
    on chat_history_keys (chat_id, created_at desc);

create table if not exists chat_history_key_access (
    id uuid primary key,
    history_key_id uuid not null references chat_history_keys (id) on delete cascade,
    recipient_user_id uuid not null references app_users (id) on delete cascade,
    recipient_device_id uuid not null references user_encryption_devices (id) on delete cascade,
    wrapped_key_payload_json text not null,
    granted_by_user_id uuid not null references app_users (id) on delete cascade,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create unique index if not exists uq_chat_history_key_access_history_device
    on chat_history_key_access (history_key_id, recipient_device_id);

create index if not exists ix_chat_history_key_access_recipient
    on chat_history_key_access (recipient_user_id, recipient_device_id);

alter table chat_messages
    add column if not exists history_key_id uuid references chat_history_keys (id) on delete set null;

alter table chat_messages
    add column if not exists history_envelope_json text;
