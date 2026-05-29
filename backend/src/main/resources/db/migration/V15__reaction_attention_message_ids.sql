alter table user_chat_reaction_attentions
    add column if not exists message_ids text not null default '';

update user_chat_reaction_attentions
    set message_ids = message_id::text
    where message_id is not null
      and message_ids = '';
