alter table chat_rooms
    add column direct_user_low_id uuid references app_users (id) on delete cascade,
    add column direct_user_high_id uuid references app_users (id) on delete cascade;

update chat_rooms room
set direct_user_low_id = direct_pair.low_user_id,
    direct_user_high_id = direct_pair.high_user_id
from (
    select
        participant_users.chat_id,
        (array_agg(participant_users.user_id order by participant_users.user_id::text))[1] as low_user_id,
        (array_agg(participant_users.user_id order by participant_users.user_id::text))[2] as high_user_id
    from (
        select distinct participant.chat_id, participant.user_id
        from chat_participants participant
        join chat_rooms candidate on candidate.id = participant.chat_id
        where candidate.is_direct = true
    ) participant_users
    group by participant_users.chat_id
    having count(*) = 2
) direct_pair
where room.id = direct_pair.chat_id
  and room.is_direct = true;

alter table chat_rooms
    add constraint chk_chat_rooms_direct_pair
        check (
            (
                direct_user_low_id is null
                and direct_user_high_id is null
            )
            or (
                is_direct = true
                and direct_user_low_id is not null
                and direct_user_high_id is not null
                and direct_user_low_id::text < direct_user_high_id::text
            )
        );

create unique index uk_chat_rooms_direct_pair
    on chat_rooms (direct_user_low_id, direct_user_high_id)
    where is_direct = true
      and direct_user_low_id is not null
      and direct_user_high_id is not null;
