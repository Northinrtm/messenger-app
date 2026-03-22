package com.north.messenger.api.dto;

import java.time.Instant;
import java.util.UUID;

public record AuthResponse(
        String token,
        Instant tokenExpiresAt,
        String refreshToken,
        Instant refreshTokenExpiresAt,
        UUID sessionId,
        UserProfileResponse user
) {
}
