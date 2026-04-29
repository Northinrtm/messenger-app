create table if not exists chat_history_backfill_status (
    id uuid primary key,
    chat_id uuid not null references chat_rooms (id) on delete cascade,
    recipient_user_id uuid not null references app_users (id) on delete cascade,
    primary_grantor_user_id uuid references app_users (id) on delete set null,
    joined_at timestamptz not null,
    required_history_key_count integer not null,
    granted_history_key_count integer not null,
    state varchar(24) not null,
    completed_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create unique index if not exists uq_chat_history_backfill_status_chat_recipient
    on chat_history_backfill_status (chat_id, recipient_user_id);

create index if not exists ix_chat_history_backfill_status_recipient_chat
    on chat_history_backfill_status (recipient_user_id, chat_id);
