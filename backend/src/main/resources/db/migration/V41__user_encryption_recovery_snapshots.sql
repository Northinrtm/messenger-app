create table user_encryption_recovery_snapshots (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    snapshot_payload_json text not null,
    wrapped_identity_record_json text not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    constraint uk_user_encryption_recovery_snapshots_user_id unique (user_id)
);
