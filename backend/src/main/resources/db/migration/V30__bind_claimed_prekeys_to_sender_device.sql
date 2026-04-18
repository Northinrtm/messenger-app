alter table user_encryption_one_time_prekeys
    add column claimed_by_sender_device_id uuid references user_encryption_devices(id) on delete set null;

create index idx_user_encryption_one_time_prekeys_claimed_sender
    on user_encryption_one_time_prekeys(claimed_by_sender_device_id);
