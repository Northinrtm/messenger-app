create index idx_message_dispatch_outbox_pending_due
    on message_dispatch_outbox (available_at, created_at)
    where processed_at is null;
