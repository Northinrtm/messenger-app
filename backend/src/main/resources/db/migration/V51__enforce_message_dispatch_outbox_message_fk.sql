delete from message_dispatch_outbox outbox
where not exists (
    select 1
    from chat_messages message
    where message.id = outbox.message_id
);

alter table message_dispatch_outbox
    add constraint message_dispatch_outbox_message_id_fkey
        foreign key (message_id)
        references chat_messages (id)
        on delete cascade;
