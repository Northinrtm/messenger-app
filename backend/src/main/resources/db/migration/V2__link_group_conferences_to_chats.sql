alter table video_conferences
    add column chat_id uuid references chat_rooms(id) on delete cascade;

create index idx_video_conferences_chat_id on video_conferences (chat_id);
create index idx_video_conferences_chat_active on video_conferences (chat_id, ended_at, started_at);
