create sequence if not exists chat_messages_server_order_seq start with 1 increment by 1;

alter table chat_messages
    add column server_order bigint default nextval('chat_messages_server_order_seq');

update chat_messages
set server_order = nextval('chat_messages_server_order_seq')
where server_order is null;

alter table chat_messages
    alter column server_order set not null;

alter table chat_messages
    alter column client_message_id set not null;

create unique index if not exists uk_chat_messages_server_order
    on chat_messages (server_order);

create index if not exists idx_chat_messages_chat_id_server_order
    on chat_messages (chat_id, server_order desc);
