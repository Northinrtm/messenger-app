create table if not exists chat_message_recipient_payloads (
    message_id uuid not null references chat_messages (id) on delete cascade,
    recipient_device_id uuid not null references user_encryption_devices (id) on delete cascade,
    recipient_user_id uuid not null references app_users (id) on delete cascade,
    encrypted_payload text not null,
    created_at timestamptz not null,
    primary key (message_id, recipient_device_id)
);

create index if not exists ix_chat_message_recipient_payloads_message_user
    on chat_message_recipient_payloads (message_id, recipient_user_id);

create index if not exists ix_chat_message_recipient_payloads_recipient_user
    on chat_message_recipient_payloads (recipient_user_id, message_id);

insert into chat_message_recipient_payloads (
    message_id,
    recipient_device_id,
    recipient_user_id,
    encrypted_payload,
    created_at
)
select
    message.id,
    device.id,
    device.user_id,
    recipient_payload.value,
    message.created_at
from chat_messages message
cross join lateral jsonb_each_text(message.encrypted_keys_json::jsonb) as recipient_payload(key, value)
join user_encryption_devices device
    on device.id = recipient_payload.key::uuid
where message.encrypted_keys_json is not null
  and btrim(message.encrypted_keys_json) <> ''
on conflict (message_id, recipient_device_id) do nothing;
