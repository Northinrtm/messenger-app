package com.north.messenger.api.dto;

import java.time.Instant;

public record GroupHistoryKeyResponse(
        String historyKeyId,
        Instant createdAt
) {
}
