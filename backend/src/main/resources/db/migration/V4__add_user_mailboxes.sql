alter table app_users
    add column mail_enabled boolean not null default true;

create table user_mailboxes (
    id uuid primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    email varchar(320) not null,
    created_at timestamp with time zone not null,
    constraint uk_user_mailboxes_user_email unique (user_id, email)
);

create index idx_user_mailboxes_user_created_at
    on user_mailboxes (user_id, created_at desc);
