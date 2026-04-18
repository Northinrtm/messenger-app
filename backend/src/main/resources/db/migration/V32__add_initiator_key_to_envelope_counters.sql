alter table user_encryption_envelope_counters
    add column if not exists initiator_ephemeral_public_key text;
