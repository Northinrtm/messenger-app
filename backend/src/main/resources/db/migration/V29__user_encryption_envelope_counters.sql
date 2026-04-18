create table if not exists user_encryption_envelope_counters (
    id uuid primary key,
    sender_device_id uuid not null references user_encryption_devices(id) on delete cascade,
    recipient_device_id uuid not null references user_encryption_devices(id) on delete cascade,
    ratchet_public_key text not null,
    last_message_counter integer not null,
    updated_at timestamptz not null
);

create unique index if not exists uq_user_encryption_envelope_counters_chain
    on user_encryption_envelope_counters (sender_device_id, recipient_device_id, ratchet_public_key);
