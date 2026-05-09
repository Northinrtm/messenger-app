create table chat_pinned_messages (
    id uuid primary key,
    chat_id uuid not null references chat_rooms(id) on delete cascade,
    message_id uuid not null references chat_messages(id) on delete cascade,
    pinned_at timestamp with time zone not null,
    constraint uk_chat_pinned_messages_chat_message unique (chat_id, message_id)
);

create index ix_chat_pinned_messages_chat_pinned_at
    on chat_pinned_messages (chat_id, pinned_at desc, id desc);

insert into chat_pinned_messages (id, chat_id, message_id, pinned_at)
select (
           substr(hash_value, 1, 8) || '-' ||
           substr(hash_value, 9, 4) || '-' ||
           substr(hash_value, 13, 4) || '-' ||
           substr(hash_value, 17, 4) || '-' ||
           substr(hash_value, 21, 12)
       )::uuid,
       room.id,
       room.pinned_message_id,
       coalesce(room.pinned_at, room.created_at)
from (
         select id,
                pinned_message_id,
                pinned_at,
                created_at,
                md5(id::text || ':' || pinned_message_id::text) as hash_value
         from chat_rooms
         where pinned_message_id is not null
     ) room;
