package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record ChatHistoryBackfillStatusResponse(
        String state,
        int requiredHistoryKeyCount,
        int grantedHistoryKeyCount,
        UUID primaryGrantorUserId,
        Instant joinedAt,
        Instant completedAt
) {
}
