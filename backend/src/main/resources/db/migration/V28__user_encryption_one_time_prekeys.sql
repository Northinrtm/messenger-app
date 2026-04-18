create table user_encryption_one_time_prekeys (
    id uuid primary key,
    device_id uuid not null references user_encryption_devices(id) on delete cascade,
    key_id integer not null,
    public_key text not null,
    created_at timestamp with time zone not null,
    claimed_at timestamp with time zone
);

create unique index idx_user_encryption_one_time_prekeys_device_key on user_encryption_one_time_prekeys(device_id, key_id);
create index idx_user_encryption_one_time_prekeys_claimed on user_encryption_one_time_prekeys(claimed_at);