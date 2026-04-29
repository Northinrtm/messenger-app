package com.north.messenger.api.dto;

import java.time.Instant;

public record GroupHistoryKeyAccessResponse(
        String historyKeyId,
        String wrappedKeyPayloadJson,
        String serverGrantPayloadJson,
        Instant createdAt,
        Instant updatedAt
) {
}
