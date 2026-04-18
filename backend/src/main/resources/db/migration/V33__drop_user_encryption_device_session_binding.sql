drop index if exists idx_user_encryption_devices_session;

alter table user_encryption_devices
    drop column if exists session_id;
