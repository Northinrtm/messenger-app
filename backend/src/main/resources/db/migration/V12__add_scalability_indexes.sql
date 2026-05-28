-- Partial index for unread message count queries (runs on every workspace bootstrap per user)
create index idx_message_receipts_user_unread
    on message_receipts (user_id)
    where read_at is null;

-- Partial index for outbox poller (hot path, polled every second)
create index idx_message_dispatch_outbox_pending
    on message_dispatch_outbox (available_at, created_at)
    where processed_at is null;

-- Composite partial index for online-status queries (user presence checks)
create index idx_user_sessions_active_user
    on user_sessions (user_id, last_used_at, expires_at)
    where revoked_at is null;
