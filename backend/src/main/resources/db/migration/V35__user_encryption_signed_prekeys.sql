create table user_encryption_signed_prekeys (
    id uuid primary key,
    device_id uuid not null references user_encryption_devices(id) on delete cascade,
    key_id integer not null,
    public_key text not null,
    signature text not null,
    algorithm varchar(255) not null,
    activated_at timestamp with time zone not null,
    retired_at timestamp with time zone,
    expires_at timestamp with time zone
);

create unique index idx_user_encryption_signed_prekeys_device_key
    on user_encryption_signed_prekeys(device_id, key_id);

create unique index idx_user_encryption_signed_prekeys_current
    on user_encryption_signed_prekeys(device_id)
    where retired_at is null;

insert into user_encryption_signed_prekeys (
    id,
    device_id,
    key_id,
    public_key,
    signature,
    algorithm,
    activated_at,
    retired_at,
    expires_at
)
select
    gen_random_uuid(),
    device.id,
    device.signed_prekey_id,
    device.signed_prekey_public_key,
    device.signed_prekey_signature,
    device.signed_prekey_algorithm,
    device.registered_at,
    null,
    null
from user_encryption_devices device
where device.retired_at is null
on conflict do nothing;
