alter table user_pending_outgoing_messages
    add column forwarded_from_message_id uuid;
