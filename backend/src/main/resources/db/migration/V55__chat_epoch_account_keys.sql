alter table user_encryption_recovery_snapshots
    add column if not exists account_public_key text;

create table if not exists chat_history_key_user_access (
    id uuid primary key,
    history_key_id uuid not null references chat_history_keys (id) on delete cascade,
    recipient_user_id uuid not null references app_users (id) on delete cascade,
    wrapped_key_payload_json text not null,
    granted_by_user_id uuid not null references app_users (id) on delete cascade,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create unique index if not exists uq_chat_history_key_user_access_history_user
    on chat_history_key_user_access (history_key_id, recipient_user_id);

create index if not exists ix_chat_history_key_user_access_recipient
    on chat_history_key_user_access (recipient_user_id, updated_at desc);
