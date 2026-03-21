package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record UserProfileResponse(
        UUID id,
        String username,
        String displayName,
        Instant createdAt
) {
}

