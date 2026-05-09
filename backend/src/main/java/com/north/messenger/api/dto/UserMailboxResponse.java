package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record UserMailboxResponse(
        UUID id,
        String email,
        Instant createdAt
) {
}
