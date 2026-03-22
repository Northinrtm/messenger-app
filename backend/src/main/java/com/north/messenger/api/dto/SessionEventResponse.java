package com.north.messenger.api.dto;

import java.util.UUID;

public record SessionEventResponse(
        String type,
        UUID sessionId
) {
    public static final String SESSION_REVOKED = "SESSION_REVOKED";
}
