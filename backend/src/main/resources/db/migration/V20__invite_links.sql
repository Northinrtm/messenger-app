create table invite_links (
    id uuid primary key,
    code varchar(16) not null,
    target_type varchar(24) not null,
    target_id uuid not null,
    created_at timestamp with time zone not null,
    constraint uk_invite_links_code unique (code),
    constraint uk_invite_links_target unique (target_type, target_id)
);

create index idx_invite_links_target
    on invite_links (target_type, target_id);
