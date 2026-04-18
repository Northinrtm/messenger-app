alter table user_encryption_one_time_prekeys
    add column accepted_at timestamp with time zone,
    add column accepted_initiator_ephemeral_public_key text,
    add column accepted_ratchet_public_key text;

create index idx_user_encryption_one_time_prekeys_accepted_at
    on user_encryption_one_time_prekeys(accepted_at);
