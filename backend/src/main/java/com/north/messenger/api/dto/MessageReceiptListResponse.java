package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record MessageReceiptListResponse(List<Entry> receipts) {
    public record Entry(
            UUID userId,
            String username,
            String displayName,
            String avatarUrl,
            Instant deliveredAt,
            Instant readAt
    ) {}
}
