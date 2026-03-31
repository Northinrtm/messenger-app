create table conference_recordings (
    conference_id uuid primary key references video_conferences(id) on delete cascade,
    stored_filename varchar(220) not null,
    mime_type varchar(120) not null,
    size_bytes bigint not null,
    created_at timestamp with time zone not null,
    uploaded_by_user_id uuid not null references app_users(id) on delete cascade
);
