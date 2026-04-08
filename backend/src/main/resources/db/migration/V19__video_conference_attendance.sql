create table video_conference_attendance (
    id uuid primary key,
    conference_id uuid not null references video_conferences(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    session_id uuid not null references user_sessions(id) on delete cascade,
    joined_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    left_at timestamp with time zone,
    constraint uk_video_conference_attendance_session unique (conference_id, session_id)
);

create index idx_video_conference_attendance_conference_active
    on video_conference_attendance (conference_id, left_at, last_seen_at desc);

create index idx_video_conference_attendance_session
    on video_conference_attendance (session_id);
