alter table app_users
    add column password_version bigint not null default 1;

alter table user_encryption_recovery_snapshots
    add column wrapped_password_version bigint not null default 1;
