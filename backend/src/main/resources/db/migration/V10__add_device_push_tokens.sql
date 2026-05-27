create table device_push_tokens (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    token varchar(512) not null,
    platform varchar(16) not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint uk_device_push_tokens_token unique (token),
    constraint chk_device_push_tokens_platform check (platform in ('ANDROID', 'IOS'))
);

create index idx_device_push_tokens_user_id on device_push_tokens(user_id);
