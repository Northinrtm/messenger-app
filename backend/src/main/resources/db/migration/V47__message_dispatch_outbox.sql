create table message_dispatch_outbox (
    id uuid primary key,
    chat_id uuid not null,
    message_id uuid not null,
    client_message_id varchar(255),
    dispatch_mode varchar(32) not null,
    attempt_count integer not null default 0,
    available_at timestamp with time zone not null,
    processed_at timestamp with time zone,
    created_at timestamp with time zone not null,
    last_error varchar(2000)
);

create index idx_message_dispatch_outbox_due
    on message_dispatch_outbox (processed_at, available_at, created_at);
