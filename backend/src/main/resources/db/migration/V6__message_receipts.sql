create table message_receipts (
    id uuid primary key,
    message_id uuid not null references chat_messages(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    constraint uk_message_receipts_message_user unique (message_id, user_id),
    constraint chk_message_receipts_read_requires_delivery check (read_at is null or delivered_at is not null)
);

create index idx_message_receipts_message_id
    on message_receipts (message_id);

create index idx_message_receipts_user_id
    on message_receipts (user_id);
