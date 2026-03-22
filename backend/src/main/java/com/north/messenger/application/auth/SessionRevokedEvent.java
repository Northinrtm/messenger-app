package com.north.messenger.application.auth;

import java.util.UUID;

public record SessionRevokedEvent(
        String username,
        UUID sessionId
) {
}
