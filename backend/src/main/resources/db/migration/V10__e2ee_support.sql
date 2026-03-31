create table user_encryption_keys (
    user_id uuid primary key references app_users(id) on delete cascade,
    public_key text not null,
    encrypted_private_key text not null,
    kdf_salt varchar(255) not null,
    kdf_iv varchar(255) not null,
    kdf_iterations integer not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null
);

alter table chat_messages
    alter column content type text;

alter table chat_messages
    add column encryption_scheme varchar(120),
    add column encryption_iv varchar(255),
    add column encrypted_keys_json text;
