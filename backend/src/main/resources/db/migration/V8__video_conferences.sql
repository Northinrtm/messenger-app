create table video_conferences (
    id uuid primary key,
    title varchar(120) not null,
    room_name varchar(180) not null unique,
    created_by_user_id uuid not null references app_users(id) on delete cascade,
    scheduled_at timestamp with time zone not null,
    created_at timestamp with time zone not null
);

create table video_conference_participants (
    id uuid primary key,
    conference_id uuid not null references video_conferences(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    invited_at timestamp with time zone not null,
    constraint uk_video_conference_participant unique (conference_id, user_id)
);

create index idx_video_conference_participants_user_id
    on video_conference_participants (user_id);
create index idx_video_conference_participants_conference_id
    on video_conference_participants (conference_id);
create index idx_video_conferences_scheduled_at
    on video_conferences (scheduled_at desc);
