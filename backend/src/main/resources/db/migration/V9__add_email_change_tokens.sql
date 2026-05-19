create table email_change_tokens (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    pending_email varchar(320) not null,
    token_hash varchar(64) not null,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone
);

create index idx_email_change_tokens_user_id on email_change_tokens(user_id);
create index idx_email_change_tokens_token_hash on email_change_tokens(token_hash);
