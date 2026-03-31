alter table video_conferences
    add column ended_at timestamp with time zone;

create index idx_video_conferences_ended_at
    on video_conferences (ended_at);
