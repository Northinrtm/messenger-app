create table user_sessions (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    token_hash varchar(64) not null,
    created_at timestamp with time zone not null,
    last_used_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    revoked_at timestamp with time zone
);

create index idx_user_sessions_user_id on user_sessions (user_id);
create index idx_user_sessions_expires_at on user_sessions (expires_at);
