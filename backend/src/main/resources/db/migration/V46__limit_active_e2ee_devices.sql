update user_encryption_devices
set retired_at = current_timestamp
where id in (
    select ranked.id
    from (
        select
            id,
            row_number() over (
                partition by user_id
                order by last_seen_at desc, registered_at desc
            ) as retention_rank
        from user_encryption_devices
        where retired_at is null
    ) ranked
    where ranked.retention_rank > 8
);

create index if not exists idx_user_encryption_devices_active_user_seen
    on user_encryption_devices(user_id, last_seen_at desc, registered_at desc)
    where retired_at is null;
