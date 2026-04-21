create table user_push_subscriptions (
    id uuid primary key,
    user_id uuid not null references app_users (id) on delete cascade,
    endpoint varchar(2048) not null unique,
    p256dh varchar(512) not null,
    auth varchar(256) not null,
    expiration_time timestamptz,
    user_agent varchar(512),
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create index idx_user_push_subscriptions_user
    on user_push_subscriptions (user_id, updated_at desc);
