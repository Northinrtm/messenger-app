create table user_encryption_devices (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    session_id uuid not null references user_sessions(id) on delete cascade,
    device_name varchar(255) not null,
    identity_key text not null,
    identity_key_algorithm varchar(255) not null,
    identity_signature_key text not null,
    identity_signature_key_algorithm varchar(255) not null,
    signed_prekey_id integer not null,
    signed_prekey_public_key text not null,
    signed_prekey_signature text not null,
    signed_prekey_algorithm varchar(255) not null,
    registered_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    retired_at timestamp with time zone
);

create unique index idx_user_encryption_devices_session on user_encryption_devices(session_id);