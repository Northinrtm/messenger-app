alter table chat_messages
    add column client_message_id varchar(120);

create unique index uk_chat_messages_sender_client_message
    on chat_messages (chat_id, sender_id, client_message_id);
