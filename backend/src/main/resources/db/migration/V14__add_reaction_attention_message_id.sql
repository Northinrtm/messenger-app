alter table user_chat_reaction_attentions
    add column if not exists message_id uuid;
