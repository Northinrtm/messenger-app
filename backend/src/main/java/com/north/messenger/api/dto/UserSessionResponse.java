package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record UserSessionResponse(
        UUID id,
        Instant createdAt,
        Instant lastUsedAt,
        Instant expiresAt,
        String deviceName
) {
}
