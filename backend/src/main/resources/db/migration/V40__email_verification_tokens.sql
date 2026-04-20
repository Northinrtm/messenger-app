alter table app_users
    add column email_verified_at timestamp with time zone;

update app_users
set email_verified_at = created_at
where email_verified_at is null;

create table email_verification_tokens (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    token_hash varchar(64) not null,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone,
    constraint uk_email_verification_tokens_token_hash unique (token_hash)
);

create index idx_email_verification_tokens_user_id
    on email_verification_tokens (user_id);

create index idx_email_verification_tokens_expires_at
    on email_verification_tokens (expires_at);
