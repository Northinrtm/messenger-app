alter table app_users
    add column email varchar(320) not null;

create unique index uk_app_users_email_lower
    on app_users ((lower(email)));

create table password_reset_tokens (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    token_hash varchar(64) not null,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone,
    constraint uk_password_reset_tokens_token_hash unique (token_hash)
);

create index idx_password_reset_tokens_user_id
    on password_reset_tokens (user_id);

create index idx_password_reset_tokens_expires_at
    on password_reset_tokens (expires_at);
