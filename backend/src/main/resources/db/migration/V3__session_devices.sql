alter table user_sessions
    add column device_name varchar(160);

update user_sessions
set device_name = 'Unknown device'
where device_name is null;

alter table user_sessions
    alter column device_name set not null;
