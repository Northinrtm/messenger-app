package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record ActiveGroupHistoryKeyAccessEventResponse(
        UUID chatId,
        String historyKeyId,
        String wrappedKeyPayloadJson,
        String serverGrantPayloadJson,
        Instant createdAt,
        Instant updatedAt
) {
}
