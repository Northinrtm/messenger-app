alter table video_conferences
    alter column room_name drop not null;

alter table video_conferences
    add column activated_at timestamp with time zone;

update video_conferences
set activated_at = created_at
where room_name is not null
  and activated_at is null;

create index idx_video_conferences_activated_at
    on video_conferences (activated_at);
